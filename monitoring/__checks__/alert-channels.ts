import { EmailAlertChannel } from 'checkly/constructs'

// The address is read at test/deploy time so it never lands in the public repo.
const address = process.env.ALERT_EMAIL
if (!address) {
  throw new Error('Set ALERT_EMAIL before running checkly test or checkly deploy.')
}

export const emailAlert = new EmailAlertChannel('email-alert', {
  address,
  sendFailure: true,
  sendRecovery: true,
  sendDegraded: false,
})
