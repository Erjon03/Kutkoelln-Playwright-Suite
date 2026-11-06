import { randomUUID } from 'crypto';
import { request, type APIRequestContext } from '@playwright/test';
import type { ResolvedConfig } from '../config/types';
import { CUSTOMER_CREATE_TIMEOUT, generatedEmailPattern, type TestCustomer } from '../data/customer';
import { apiError } from './errors';

type Criteria = Record<string, unknown>;

/**
 * Minimal Shopware Admin API client (used for test data setup & cleanup).
 * Auth: integration (client_credentials) preferred, admin user (password) as fallback.
 */
export class AdminApiClient {
  private token?: { value: string; expiresAt: number };
  /** ids for createCustomer, looked up once per worker */
  private customerDefaults?: Promise<Record<string, string | undefined>>;

  private constructor(
    private readonly ctx: APIRequestContext,
    private readonly cfg: ResolvedConfig,
  ) {}

  static async create(cfg: ResolvedConfig): Promise<AdminApiClient> {
    const ctx = await request.newContext({
      baseURL: cfg.baseURL,
      httpCredentials: cfg.env.httpCredentials,
      extraHTTPHeaders: { Accept: 'application/json' },
    });
    return new AdminApiClient(ctx, cfg);
  }

  async dispose(): Promise<void> {
    await this.ctx.dispose();
  }

  private async authHeader(): Promise<Record<string, string>> {
    if (!this.token || Date.now() > this.token.expiresAt) {
      const a = this.cfg.env.admin;
      const data =
        a.clientId && a.clientSecret
          ? { grant_type: 'client_credentials', client_id: a.clientId, client_secret: a.clientSecret }
          : { grant_type: 'password', client_id: 'administration', scopes: 'write', username: a.username, password: a.password };
      const res = await this.ctx.post('/api/oauth/token', { data });
      if (!res.ok()) throw new Error(`Admin API auth failed: ${await apiError(res)}`);
      const json = await res.json();
      this.token = { value: json.access_token, expiresAt: Date.now() + (json.expires_in - 30) * 1000 };
    }
    return { Authorization: `Bearer ${this.token.value}` };
  }

  async search<T = Record<string, any>>(entity: string, criteria: Criteria = {}): Promise<T[]> {
    const res = await this.ctx.post(`/api/search/${entity}`, { headers: await this.authHeader(), data: criteria });
    if (!res.ok()) throw new Error(`Admin search ${entity} failed: ${await apiError(res)}`);
    return (await res.json()).data as T[];
  }

  async create(entity: string, data: Record<string, unknown>, opts: { timeout?: number } = {}): Promise<void> {
    const res = await this.ctx.post(`/api/${entity}`, { headers: await this.authHeader(), data, timeout: opts.timeout });
    if (!res.ok()) throw new Error(`Admin POST ${entity} failed: ${await apiError(res)}`);
  }

  async patch(entity: string, id: string, data: Record<string, unknown>): Promise<void> {
    const res = await this.ctx.patch(`/api/${entity}/${id}`, { headers: await this.authHeader(), data });
    if (!res.ok()) throw new Error(`Admin PATCH ${entity}/${id} failed: ${await apiError(res)}`);
  }

  async delete(entity: string, id: string): Promise<void> {
    const res = await this.ctx.delete(`/api/${entity}/${id}`, { headers: await this.authHeader() });
    if (!res.ok() && res.status() !== 404) throw new Error(`Admin DELETE ${entity}/${id} failed: ${res.status()}`);
  }

  /** Finds the Store API access key of the sales channel serving baseURL. */
  async resolveAccessKey(baseURL: string): Promise<string> {
    const host = new URL(baseURL).host;
    const channels = await this.search<{ accessKey: string; domains: { url: string }[] }>('sales-channel', {
      filter: [{ type: 'contains', field: 'domains.url', value: host }],
      associations: { domains: {} },
    });
    const norm = (u: string) => u.replace(/\/+$/, '');
    const exact = channels.find((c) => c.domains?.some((d) => norm(d.url) === norm(baseURL)));
    const channel = exact ?? channels[0];
    if (!channel) throw new Error(`No sales channel with a domain matching ${host}`);
    return channel.accessKey;
  }

  async findCustomerByEmail(email: string): Promise<{ id: string } | undefined> {
    const [c] = await this.search<{ id: string }>('customer', {
      filter: [{ type: 'equals', field: 'email', value: email }],
      limit: 1,
    });
    return c;
  }

  async activateCustomer(email: string): Promise<void> {
    const c = await this.findCustomerByEmail(email);
    if (c) await this.patch('customer', c.id, { active: true, doubleOptInRegistration: false });
  }

  /**
   * Creates an active customer directly in a customer group, bound to the sales channel serving
   * cfg.baseURL — for B2B shops where the storefront / Store API refuse self-registration.
   */
  async createCustomer(customer: TestCustomer, groupName: string): Promise<void> {
    this.customerDefaults ??= this.lookupCustomerDefaults(customer, groupName);
    const d = await this.customerDefaults;
    const addressId = randomUUID().replace(/-/g, '');
    const { address } = customer;
    await this.create('customer', {
      groupId: d.groupId,
      salesChannelId: d.salesChannelId,
      boundSalesChannelId: d.salesChannelId,
      languageId: d.languageId,
      defaultPaymentMethodId: d.paymentMethodId,
      customerNumber: `S25-${Date.now()}-${randomUUID().slice(0, 6)}`,
      salutationId: d.salutationId,
      firstName: customer.firstName,
      lastName: customer.lastName,
      email: customer.email,
      password: customer.password,
      active: true,
      // B2B profiles (testData.customer.company / vatId): business customer like a real dealer account
      ...(customer.company ? { accountType: 'business', company: customer.company } : {}),
      ...(customer.vatId ? { vatIds: [customer.vatId] } : {}),
      defaultBillingAddressId: addressId,
      defaultShippingAddressId: addressId,
      addresses: [
        {
          id: addressId,
          salutationId: d.salutationId,
          firstName: customer.firstName,
          lastName: customer.lastName,
          company: customer.company,
          street: address.street,
          zipcode: address.zipcode,
          city: address.city,
          countryId: d.countryId,
          countryStateId: d.countryStateId,
          phoneNumber: address.phoneNumber,
        },
      ],
    }, { timeout: CUSTOMER_CREATE_TIMEOUT });
  }

  private async lookupCustomerDefaults(customer: TestCustomer, groupName: string): Promise<Record<string, string | undefined>> {
    const host = new URL(this.cfg.baseURL).host;
    const [channel] = await this.search<{ id: string; languageId: string; paymentMethodId: string }>('sales-channel', {
      filter: [{ type: 'contains', field: 'domains.url', value: host }],
      limit: 1,
    });
    if (!channel) throw new Error(`No sales channel with a domain matching ${host}`);
    const [group] = await this.search<{ id: string }>('customer-group', {
      filter: [{ type: 'equals', field: 'name', value: groupName }],
      limit: 1,
    });
    if (!group) throw new Error(`Customer group "${groupName}" not found (testData.customer.customerGroup)`);
    const [country] = await this.search<{ id: string }>('country', {
      filter: [{ type: 'equals', field: 'iso', value: customer.address.countryIso }],
      limit: 1,
    });
    if (!country) throw new Error(`Country ${customer.address.countryIso} not found`);
    const { stateShortCode } = customer.address;
    const [state] = stateShortCode
      ? await this.search<{ id: string }>('country-state', { filter: [{ type: 'equals', field: 'shortCode', value: stateShortCode }], limit: 1 })
      : [];
    const [salutation] = await this.search<{ id: string }>('salutation', {
      filter: [{ type: 'equals', field: 'salutationKey', value: 'mr' }],
      limit: 1,
    });
    return {
      salesChannelId: channel.id,
      languageId: channel.languageId,
      paymentMethodId: channel.paymentMethodId,
      groupId: group.id,
      countryId: country.id,
      countryStateId: state?.id,
      salutationId: salutation?.id,
    };
  }

  async deleteCustomerByEmail(email: string): Promise<void> {
    const c = await this.findCustomerByEmail(email);
    if (c) await this.delete('customer', c.id);
  }

  /**
   * Housekeeping: remove customers created by the suite (by e-mail prefix). With createdBefore only older ones,
   * so customers still in use by a parallel run (e.g. another CI shard) are left alone.
   * Only e-mails in the generated format (generatedEmailPattern) are deleted — manually created accounts
   * that share the prefix are never touched.
   */
  async deleteTestCustomers(emailPrefix: string, emailDomain: string, createdBefore?: Date): Promise<number> {
    const generated = generatedEmailPattern(emailPrefix, emailDomain);
    let deleted = 0;
    // page in batches of 100 (some shops cap the API limit); skipped (non-generated) matches stay → offset past them
    for (let page = 1; ; page++) {
      const batch = await this.search<{ id: string; email: string }>('customer', {
        filter: [
          { type: 'prefix', field: 'email', value: `${emailPrefix}-` },
          { type: 'suffix', field: 'email', value: `@${emailDomain}` },
          ...(createdBefore ? [{ type: 'range', field: 'createdAt', parameters: { lt: createdBefore.toISOString() } }] : []),
        ],
        includes: { customer: ['id', 'email'] },
        sort: [{ field: 'createdAt', order: 'ASC' }],
        limit: 100,
        page,
      });
      if (batch.length === 0) return deleted;
      const own = batch.filter((c) => generated.test(c.email.toLowerCase()));
      for (const c of own) await this.delete('customer', c.id);
      deleted += own.length;
      // deleted rows shift the following pages → stay on this page while something was deleted
      if (own.length > 0) page--;
      if (batch.length < 100 && own.length === 0) return deleted;
    }
  }
}
