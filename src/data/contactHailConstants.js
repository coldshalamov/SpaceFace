// Leaf constants shared by contact copy and scanner combat readers. Keep these free
// of imports: cargo/damage readers can reach the scanner while a hail is loading.
export const CONTACT_HAIL_RANGE = 5200;
export const CONTACT_HAIL_REQUEST_TTL_S = 8;
export const CONTACT_HAIL_RECEIPT_TTL_S = 4;
