import { env } from "@/lib/env";

/**
 * Business topology: Brands → Meta ad accounts + Triple Whale stores.
 *
 * This is the single source of truth that maps the flat env vars into the
 * structured accounts/stores the rest of the app (services, jobs, UI filters)
 * reason about. Adding a new brand/store later is a matter of editing this file.
 */

export type BrandKey = "NOBL" | "FLO";

export interface MetaAccountConfig {
  key: string;
  label: string;
  brand: BrandKey;
  accountId: string;
  accessToken: string;
  configured: boolean;
}

export interface TripleWhaleStoreConfig {
  key: string;
  label: string;
  brand: BrandKey;
  region: "US" | "EU" | "UK";
  shopId: string;
  apiKey: string;
  configured: boolean;
}

export interface BrandConfig {
  key: BrandKey;
  label: string;
  metaAccounts: MetaAccountConfig[];
  stores: TripleWhaleStoreConfig[];
}

const isSet = (v?: string) => Boolean(v && v.trim().length > 0);

export const META_ACCOUNTS: MetaAccountConfig[] = [
  {
    key: "nobl_meta",
    label: "NOBL Meta Ad Account",
    brand: "NOBL",
    accountId: env.NOBL_META_AD_ACCOUNT_ID,
    accessToken: env.NOBL_META_ACCESS_TOKEN,
    configured: isSet(env.NOBL_META_AD_ACCOUNT_ID) && isSet(env.NOBL_META_ACCESS_TOKEN),
  },
  {
    key: "flo_meta",
    label: "FLO Meta Ad Account",
    brand: "FLO",
    accountId: env.FLO_META_AD_ACCOUNT_ID,
    accessToken: env.FLO_META_ACCESS_TOKEN,
    configured: isSet(env.FLO_META_AD_ACCOUNT_ID) && isSet(env.FLO_META_ACCESS_TOKEN),
  },
];

export const TW_STORES: TripleWhaleStoreConfig[] = [
  {
    key: "nobl_main",
    label: "NOBL main",
    brand: "NOBL",
    region: "US",
    shopId: env.NOBL_TW_SHOP_ID,
    apiKey: env.NOBL_TW_API_KEY,
    configured: isSet(env.NOBL_TW_SHOP_ID) && isSet(env.NOBL_TW_API_KEY),
  },
  {
    key: "flo_main_us",
    label: "FLO main US",
    brand: "FLO",
    region: "US",
    shopId: env.FLO_TW_SHOP_ID,
    apiKey: env.FLO_TW_API_KEY,
    configured: isSet(env.FLO_TW_SHOP_ID) && isSet(env.FLO_TW_API_KEY),
  },
  {
    key: "nobl_eu",
    label: "NOBL EU",
    brand: "NOBL",
    region: "EU",
    shopId: env.NOBL_EU_TW_SHOP_ID,
    apiKey: env.NOBL_EU_TW_API_KEY,
    configured: isSet(env.NOBL_EU_TW_SHOP_ID) && isSet(env.NOBL_EU_TW_API_KEY),
  },
  {
    key: "nobl_uk",
    label: "NOBL UK",
    brand: "NOBL",
    region: "UK",
    shopId: env.NOBL_UK_TW_SHOP_ID,
    apiKey: env.NOBL_UK_TW_API_KEY,
    configured: isSet(env.NOBL_UK_TW_SHOP_ID) && isSet(env.NOBL_UK_TW_API_KEY),
  },
];

export const BRANDS: BrandConfig[] = [
  {
    key: "NOBL",
    label: "NOBL",
    metaAccounts: META_ACCOUNTS.filter((a) => a.brand === "NOBL"),
    stores: TW_STORES.filter((s) => s.brand === "NOBL"),
  },
  {
    key: "FLO",
    label: "FLO",
    metaAccounts: META_ACCOUNTS.filter((a) => a.brand === "FLO"),
    stores: TW_STORES.filter((s) => s.brand === "FLO"),
  },
];

export function getBrand(key: BrandKey): BrandConfig | undefined {
  return BRANDS.find((b) => b.key === key);
}

export function getMetaAccount(key: string): MetaAccountConfig | undefined {
  return META_ACCOUNTS.find((a) => a.key === key);
}

export function getTwStore(key: string): TripleWhaleStoreConfig | undefined {
  return TW_STORES.find((s) => s.key === key);
}

/** Public, secret-free view for shipping to the client (Settings UI, filters). */
export function publicTopology() {
  return {
    brands: BRANDS.map((b) => ({
      key: b.key,
      label: b.label,
      metaAccounts: b.metaAccounts.map((a) => ({
        key: a.key,
        label: a.label,
        accountId: a.accountId,
        configured: a.configured,
      })),
      stores: b.stores.map((s) => ({
        key: s.key,
        label: s.label,
        region: s.region,
        shopId: s.shopId,
        configured: s.configured,
      })),
    })),
  };
}
