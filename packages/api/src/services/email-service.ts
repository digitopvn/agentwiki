/** Email service — send transactional emails via Resend REST API */

import type { Env } from '../env'

interface SendEmailParams {
  to: string | string[]
  subject: string
  html: string
  text?: string
  replyTo?: string
}

interface ResendResponse {
  id: string
}

interface ResendError {
  statusCode: number
  message: string
  name: string
}

/** Send an email via Resend API (no SDK needed — simple fetch) */
export async function sendEmail(env: Env, params: SendEmailParams): Promise<{ id: string }> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.RESEND_FROM_EMAIL,
      to: Array.isArray(params.to) ? params.to : [params.to],
      subject: params.subject,
      html: params.html,
      text: params.text,
      reply_to: params.replyTo,
    }),
  })

  if (!res.ok) {
    const error = (await res.json()) as ResendError
    throw new Error(`Resend error: ${error.message}`)
  }

  return (await res.json()) as ResendResponse
}

/** Welcome email sent after first signup */
export async function sendWelcomeEmail(env: Env, to: string, name: string) {
  return sendEmail(env, {
    to,
    subject: 'Welcome to AgentWiki!',
    html: `
      <div style="font-family: -apple-system, sans-serif; max-width: 560px; margin: 0 auto;">
        <h2>Welcome, ${escapeHtml(name)}!</h2>
        <p>Your knowledge workspace is ready. Start creating documents, organizing with folders, and building your personal wiki.</p>
        <p><a href="${env.APP_URL}" style="display:inline-block;padding:10px 20px;background:#2563eb;color:#fff;border-radius:6px;text-decoration:none;">Open AgentWiki</a></p>
        <p style="color:#6b7280;font-size:13px;">If you have questions, just reply to this email.</p>
      </div>
    `,
    text: `Welcome, ${name}! Your AgentWiki workspace is ready. Visit ${env.APP_URL} to get started.`,
  })
}

/** Escape HTML to prevent XSS in email templates */
function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
