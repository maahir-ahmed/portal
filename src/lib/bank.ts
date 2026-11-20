// Bank details as a claim takes them: the claim form, the Discord /claim command.
/** BSB as 123-456, a 4 to 10 digit account number, and an optional PayID. */
export function checkBank(accountName: string, bsb: string, accountNumber: string, payId: string) {
  const bsbDigits = bsb.replace(/[\s-]/g, "");
  const account = accountNumber.replace(/[\s-]/g, "");
  if (!accountName) return { error: "Add the account name." };
  if (!/^\d{6}$/.test(bsbDigits)) return { error: "A BSB is 6 digits, like 123-456." };
  if (!/^\d{4,10}$/.test(account)) return { error: "An account number is 4 to 10 digits." };
  return {
    accountName: accountName.slice(0, 100),
    bsb: `${bsbDigits.slice(0, 3)}-${bsbDigits.slice(3)}`,
    accountNumber: account,
    payId: payId.slice(0, 100) || null,
  };
}
