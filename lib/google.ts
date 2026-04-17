import { google } from "googleapis";
import { prisma } from "./prisma";

const SCOPES = [
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/userinfo.email",
];

function getRedirectUri() {
  const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  return `${base.replace(/\/$/, "")}/api/google/callback`;
}

export function getOAuthClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET não configurados");
  }
  return new google.auth.OAuth2(clientId, clientSecret, getRedirectUri());
}

export function getAuthUrl(state?: string) {
  const oauth2 = getOAuthClient();
  return oauth2.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
    state,
  });
}

export async function exchangeCodeForTokens(code: string) {
  const oauth2 = getOAuthClient();
  const { tokens } = await oauth2.getToken(code);
  oauth2.setCredentials(tokens);

  const oauth2v2 = google.oauth2({ version: "v2", auth: oauth2 });
  const { data: info } = await oauth2v2.userinfo.get();
  const email = info.email || "unknown@example.com";

  if (!tokens.access_token || !tokens.refresh_token) {
    throw new Error("Tokens incompletos do Google (precisa de consent/offline)");
  }

  const expiresAt = new Date(Date.now() + (tokens.expiry_date ? tokens.expiry_date - Date.now() : 3600_000));

  const saved = await prisma.googleAuth.upsert({
    where: { email },
    update: {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt,
      scope: tokens.scope || SCOPES.join(" "),
    },
    create: {
      email,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt,
      scope: tokens.scope || SCOPES.join(" "),
    },
  });
  return saved;
}

export async function getAuthorizedClient() {
  const auth = await prisma.googleAuth.findFirst({ orderBy: { updatedAt: "desc" } });
  if (!auth) return null;
  const oauth2 = getOAuthClient();
  oauth2.setCredentials({
    access_token: auth.accessToken,
    refresh_token: auth.refreshToken,
    expiry_date: auth.expiresAt.getTime(),
  });
  // auto-refresh: googleapis handles it; we also persist new tokens
  oauth2.on("tokens", async (newTokens) => {
    await prisma.googleAuth.update({
      where: { id: auth.id },
      data: {
        accessToken: newTokens.access_token || auth.accessToken,
        refreshToken: newTokens.refresh_token || auth.refreshToken,
        expiresAt: newTokens.expiry_date ? new Date(newTokens.expiry_date) : auth.expiresAt,
      },
    });
  });
  return { oauth2, calendarId: auth.calendarId };
}

export async function listUpcomingEvents(daysAhead = 60) {
  const ctx = await getAuthorizedClient();
  if (!ctx) return [];
  const calendar = google.calendar({ version: "v3", auth: ctx.oauth2 });
  const now = new Date();
  const end = new Date(now.getTime() + daysAhead * 24 * 3600 * 1000);
  const res = await calendar.events.list({
    calendarId: ctx.calendarId,
    timeMin: now.toISOString(),
    timeMax: end.toISOString(),
    singleEvents: true,
    orderBy: "startTime",
    maxResults: 200,
  });
  return res.data.items || [];
}

export async function getFreeBusy(daysAhead = 90) {
  const ctx = await getAuthorizedClient();
  if (!ctx) return { busy: [] };
  const calendar = google.calendar({ version: "v3", auth: ctx.oauth2 });
  const now = new Date();
  const end = new Date(now.getTime() + daysAhead * 24 * 3600 * 1000);
  const res = await calendar.freebusy.query({
    requestBody: {
      timeMin: now.toISOString(),
      timeMax: end.toISOString(),
      items: [{ id: ctx.calendarId }],
    },
  });
  const busy = res.data.calendars?.[ctx.calendarId]?.busy || [];
  return { busy };
}

export async function createCalendarEvent(args: {
  summary: string;
  description?: string;
  startDateTime: string;
  endDateTime: string;
  attendees?: { email: string; displayName?: string }[];
}) {
  const ctx = await getAuthorizedClient();
  if (!ctx) throw new Error("Google Calendar não conectado");
  const calendar = google.calendar({ version: "v3", auth: ctx.oauth2 });
  const res = await calendar.events.insert({
    calendarId: ctx.calendarId,
    requestBody: {
      summary: args.summary,
      description: args.description,
      start: { dateTime: args.startDateTime, timeZone: "America/Sao_Paulo" },
      end: { dateTime: args.endDateTime, timeZone: "America/Sao_Paulo" },
      attendees: args.attendees,
    },
  });
  return res.data;
}

export async function deleteCalendarEvent(eventId: string) {
  const ctx = await getAuthorizedClient();
  if (!ctx) throw new Error("Google Calendar não conectado");
  const calendar = google.calendar({ version: "v3", auth: ctx.oauth2 });
  await calendar.events.delete({ calendarId: ctx.calendarId, eventId });
}
