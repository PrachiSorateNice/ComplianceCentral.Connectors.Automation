import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const root = path.resolve(__dirname, '../..');

export const lsegConfig = {
  url: process.env.LSEG_MESSENGER_URL || 'https://messenger.refinitiv.com/messenger/',
  mcrChatName: process.env.LSEG_MCR_CHAT_NAME?.trim() || '',
  blcChatName: process.env.LSEG_BLC_CHAT_NAME?.trim() || 'BLC Chat Testing',
  attachmentsDir: path.resolve(root, process.env.LSEG_ATTACHMENTS_DIR || 'Test-Data/LSEG/attachments'),
  excelPath: path.resolve(
    root,
    process.env.LSEG_EXCEL_TESTCASES_PATH || 'Test-Data/LSEG/testcases/pra-lseg-messenger-2026-08-21.xlsx',
  ),
};

export interface LsegCredentials {
  username: string;
  password: string;
}

/** Credentials for a 1-based user index (LSEG_USERNAME_1 / LSEG_PASSWORD_1, ...). */
export function credentialsFor(userIndex: number): LsegCredentials {
  const username = process.env[`LSEG_USERNAME_${userIndex}`]?.trim();
  const password = process.env[`LSEG_PASSWORD_${userIndex}`]?.trim();
  if (!username || !password) {
    throw new Error(`LSEG_USERNAME_${userIndex} / LSEG_PASSWORD_${userIndex} not set (see .env.example)`);
  }
  return { username, password };
}

/** "avinash.dongre@nice.com" -> "Avinash Dongre" */
export function displayNameFromEmail(email: string): string {
  const local = email.includes('@') ? email.slice(0, email.indexOf('@')) : email;
  return local
    .split(/[._]/)
    .filter(Boolean)
    .map((p) => p[0].toUpperCase() + p.slice(1))
    .join(' ');
}
