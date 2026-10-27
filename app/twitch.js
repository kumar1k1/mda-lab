'use strict';
// Twitch API (Helix) для раздела «Покерные стримы»: все, кто сейчас стримит покер (категория Poker, id 488190),
// с числом зрителей и названием стрима, и кто из списка стримеров в эфире.
// Доступ — ключи приложения, которое пользователь зарегистрировал на dev.twitch.tv (Client ID и Client Secret).
// Секрет хранится в папке данных программы зашифрованным средствами Windows (safeStorage), токен — только в памяти.
const fs = require('fs');
const path = require('path');
const { net, safeStorage } = require('electron');

const POKER = '488190';
function make(userData) {
  const file = path.join(userData, 'twitch.json');
  let tok = null; // { v, exp }
  const read = () => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return null; } };
  const keys = () => {
    const c = read(); if (!c || !c.id || !c.sec) return null;
    try { const sec = c.enc ? safeStorage.decryptString(Buffer.from(c.sec, 'base64')) : Buffer.from(c.sec, 'base64').toString('utf8'); return { id: c.id, sec }; } catch (e) { return null; }
  };
  async function token(k, force) {
    if (!force && tok && tok.exp > Date.now() + 60e3) return tok.v;
    const r = await net.fetch('https://id.twitch.tv/oauth2/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: k.id, client_secret: k.sec, grant_type: 'client_credentials' }).toString() });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.access_token) throw new Error(r.status === 400 || r.status === 403 ? 'Twitch не принял Client ID или Client Secret' : 'Twitch: ' + (j.message || 'HTTP ' + r.status));
    tok = { v: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 }; return tok.v;
  }
  async function helix(k, q) {
    for (let a = 0; a < 2; a++) {
      const r = await net.fetch('https://api.twitch.tv/helix/' + q, { headers: { 'Client-Id': k.id, Authorization: 'Bearer ' + await token(k, a > 0) } });
      if (r.status === 401 && a === 0) continue;
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error('Twitch: ' + (j.message || 'HTTP ' + r.status));
      return j;
    }
  }
  const pick = (s) => ({ login: s.user_login, name: s.user_name, viewers: s.viewer_count, title: s.title || '', lang: s.language || '', game: s.game_name || '', started: Date.parse(s.started_at) || 0, tags: s.tags || [], thumb: (s.thumbnail_url || '').replace('{width}', '320').replace('{height}', '180') });
  return {
    status() { const c = read(); return { configured: !!(c && c.id && c.sec), id: c ? c.id : '' }; },
    async set(id, sec) {
      id = String(id || '').trim(); sec = String(sec || '').trim();
      if (!/^[a-z0-9]{20,40}$/i.test(id) || !/^[a-z0-9]{20,40}$/i.test(sec)) return { ok: false, error: 'Проверьте ключи: Client ID и Client Secret — по 30 латинских букв и цифр' };
      tok = null;
      try { await token({ id, sec }, true); } catch (e) { return { ok: false, error: e.message }; }
      const enc = safeStorage.isEncryptionAvailable();
      fs.mkdirSync(userData, { recursive: true });
      fs.writeFileSync(file, JSON.stringify({ id, enc, sec: (enc ? safeStorage.encryptString(sec) : Buffer.from(sec, 'utf8')).toString('base64') }));
      return { ok: true };
    },
    clear() { tok = null; try { fs.rmSync(file, { force: true }); } catch (e) { /* нет файла */ } return { ok: true }; },
    // все живые покерные стримы (до 300, самые смотрящие — первыми)
    async live() {
      const k = keys(); if (!k) return { ok: false, error: 'нет ключей' };
      try {
        const out = []; let cur = '';
        for (let p = 0; p < 3; p++) {
          const j = await helix(k, 'streams?game_id=' + POKER + '&first=100' + (cur ? '&after=' + encodeURIComponent(cur) : ''));
          (j.data || []).forEach(s => out.push(pick(s)));
          cur = j.pagination && j.pagination.cursor; if (!cur || (j.data || []).length < 100) break;
        }
        return { ok: true, at: Date.now(), streams: out.sort((a, b) => b.viewers - a.viewers) };
      } catch (e) { return { ok: false, error: e.message }; }
    },
    // кто из списка в эфире (в любой категории): login → данные стрима
    async who(logins) {
      const k = keys(); if (!k) return null;
      const out = {}, ls = logins.map(l => String(l).toLowerCase()).filter(l => /^[a-z0-9_]{2,25}$/.test(l));
      for (let i = 0; i < ls.length; i += 100) {
        const part = ls.slice(i, i + 100), j = await helix(k, 'streams?first=100&' + part.map(l => 'user_login=' + l).join('&'));
        part.forEach(l => { out[l] = false; }); (j.data || []).forEach(s => { out[s.user_login.toLowerCase()] = pick(s); });
      }
      return out;
    }
  };
}
module.exports = { make };
