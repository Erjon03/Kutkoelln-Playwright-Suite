import { request, type APIRequestContext } from '@playwright/test';
import type { ResolvedConfig } from '../config/types';
import { CUSTOMER_CREATE_TIMEOUT, type TestCustomer } from '../data/customer';
import { apiError } from './errors';

/**
 * Minimal Shopware Store API client (headless, fast test data setup).
 * Requires the sales channel access key (SW_ACCESS_KEY or resolved via Admin API).
 */
export class StoreApiClient {
  private countryCache = new Map<string, string>();

  private constructor(
    private readonly ctx: APIRequestContext,
    private readonly cfg: ResolvedConfig,
  ) {}

  static async create(cfg: ResolvedConfig, accessKey: string): Promise<StoreApiClient> {
    const ctx = await request.newContext({
      baseURL: cfg.baseURL,
      httpCredentials: cfg.env.httpCredentials,
      extraHTTPHeaders: { 'sw-access-key': accessKey, Accept: 'application/json' },
    });
    return new StoreApiClient(ctx, cfg);
  }

  async dispose(): Promise<void> {
    await this.ctx.dispose();
  }

  private async post<T = any>(
    path: string,
    data: unknown = {},
    headers: Record<string, string> = {},
    timeout?: number,
  ): Promise<{ json: T; contextToken?: string }> {
    const res = await this.ctx.post(`/store-api${path}`, { data, headers, timeout });
    if (!res.ok()) throw new Error(`Store API ${path} failed: ${await apiError(res)}`);
    return { json: (await res.json()) as T, contextToken: res.headers()['sw-context-token'] };
  }

  async countryId(iso: string): Promise<string> {
    if (!this.countryCache.has(iso)) {
      // Store API caps limit at 100 → filter by ISO instead of loading all countries
      const { json } = await this.post<{ elements: { id: string; iso: string }[] }>('/country', {
        filter: [{ type: 'equals', field: 'iso', value: iso }],
        limit: 1,
      });
      for (const c of json.elements) this.countryCache.set(c.iso, c.id);
    }
    const id = this.countryCache.get(iso);
    if (!id) throw new Error(`Country ${iso} is not assigned to the sales channel`);
    return id;
  }

  async countryStateId(countryId: string, shortCode: string): Promise<string> {
    // 6.6 applies criteria filters to the country entity here → load the states and match locally
    const { json } = await this.post<{ elements: { id: string; shortCode: string }[] }>(`/country-state/${countryId}`, { limit: 100 });
    const id = json.elements.find((s) => s.shortCode === shortCode)?.id;
    if (!id) throw new Error(`Country state ${shortCode} not found`);
    return id;
  }

  async salutationIds(): Promise<string[]> {
    const { json } = await this.post<{ elements: { id: string; salutationKey: string }[] }>('/salutation');
    return json.elements.map((s) => s.id);
  }

  /** Looks up a product by product number, returns its id (for fast cart setup). */
  async productIdByNumber(productNumber: string): Promise<string> {
    const { json } = await this.post<{ elements: { id: string }[] }>('/product', {
      filter: [{ type: 'equals', field: 'productNumber', value: productNumber }],
      limit: 1,
      includes: { product: ['id'] },
    });
    const id = json.elements[0]?.id;
    if (!id) throw new Error(`Product ${productNumber} not found / not visible in sales channel`);
    return id;
  }

  /** Registers a customer headlessly (same validation as the storefront form). */
  async registerCustomer(customer: TestCustomer): Promise<void> {
    const { address } = customer;
    const countryId = await this.countryId(address.countryIso);
    const countryStateId = address.stateShortCode ? await this.countryStateId(countryId, address.stateShortCode) : undefined;
    const salutations = await this.salutationIds().catch(() => []);
    await this.post('/account/register', {
      salutationId: salutations[0],
      firstName: customer.firstName,
      lastName: customer.lastName,
      email: customer.email,
      password: customer.password,
      passwordConfirmation: customer.password,
      storefrontUrl: this.cfg.baseURL,
      acceptedDataProtection: true,
      billingAddress: {
        firstName: customer.firstName,
        lastName: customer.lastName,
        street: address.street,
        zipcode: address.zipcode,
        city: address.city,
        countryId,
        countryStateId,
        phoneNumber: address.phoneNumber,
      },
    }, {}, CUSTOMER_CREATE_TIMEOUT);
  }

  /**
   * Empties the customer's saved cart and wishlist, so a customer shared by several tests starts each one clean.
   * The Store API login restores the customer's last cart into this new context; deleting it here means the next
   * storefront login restores an empty cart.
   */
  async resetCustomer(customer: TestCustomer): Promise<void> {
    const { contextToken } = await this.post('/account/login', { email: customer.email, username: customer.email, password: customer.password });
    if (!contextToken) return;
    const headers = { 'sw-context-token': contextToken };
    await this.ctx.delete('/store-api/checkout/cart', { headers });
    // 404 when the wishlist is empty or the feature is off
    const res = await this.ctx.post('/store-api/customer/wishlist', { headers, data: { includes: { product: ['id'] } } });
    if (!res.ok()) return;
    const { products } = (await res.json()) as { products?: { elements?: { id: string }[] } };
    for (const p of products?.elements ?? []) await this.ctx.delete(`/store-api/customer/wishlist/delete/${p.id}`, { headers });
  }
}
