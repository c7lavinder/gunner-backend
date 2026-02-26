import { isDryRun } from '../core/dry-run';
import { ghlPost, getLocationId } from '../integrations/ghl/client';
import { getConfig } from '../playbook/config';

function isInSendWindow(): boolean {
  const config = getConfig();
  const hour = new Date().getHours();
  return hour >= config.sendWindow.startHour && hour < config.sendWindow.endHour;
}

export async function smsBot(contactId: string, message: string): Promise<{ result: 'success' | 'dry-run' | 'outside-window' }> {
  if (!isInSendWindow()) {
    console.log(`[sms-bot] outside send window — queued for ${contactId}`);
    return { result: 'outside-window' };
  }
  if (isDryRun()) {
    console.log(`[sms-bot] DRY RUN — would send SMS to ${contactId}:`, message);
    return { result: 'dry-run' };
  }
  await ghlPost('/conversations/messages', {
    type: 'SMS',
    contactId,
    locationId: getLocationId(),
    message,
  });
  return { result: 'success' };
}
