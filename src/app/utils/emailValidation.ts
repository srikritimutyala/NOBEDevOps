export const KNOWN_TEST_ADMIN_EMAILS = [
  'mutyalasrikriti2006@gmail.com',
  'nobeadmintest@gmail.com',
  'testadmin@gmail.com',
  'testadmin@illinois.edu',
  'testadmin@nobe.com',
  'testadmin@nobe.test',
  'dummyadmin@nobe.test',
];

/**
 * Checks if the given email address belongs to a designated test admin account.
 */
export function isTestAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();

  if (KNOWN_TEST_ADMIN_EMAILS.includes(normalized)) {
    return true;
  }

  const envAdminEmail = process.env.NEXT_PUBLIC_ADMIN_NOTIFICATION_EMAIL?.trim().toLowerCase();
  if (envAdminEmail && normalized === envAdminEmail) {
    return true;
  }

  const localPart = normalized.split('@')[0];
  if (
    localPart === 'testadmin' ||
    localPart.startsWith('testadmin') ||
    localPart.startsWith('nobeadmin')
  ) {
    return true;
  }

  return false;
}

/**
 * Validates if an email address is authorized (either ending in @illinois.edu or a test admin email).
 */
export function isAllowedEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();

  if (normalized.endsWith('@illinois.edu')) {
    return true;
  }

  return isTestAdminEmail(normalized);
}
