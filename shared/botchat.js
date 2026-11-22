// "Bot Ngobrol": bot berdiskusi sendiri seperti warga.
// Tiap bot punya sifat, rasa curiga ke pemain lain, dan pengetahuan sesuai perannya.
// Mereka bereaksi pada kematian, menuduh, membela diri, mengaku peran (Seer), berunding (serigala),
// membalas chat pemain lain, dan memilih saat voting berdasarkan kecurigaan.

const pick = (a) => a[Math.floor(Math.random() * a.length)];
const chance = (p) => Math.random() < p;
const base = (name) => String(name || '').replace(/\s*🤖\s*/g, '').trim();
const fill = (t, o) => t.replace(/\{(\w+)\}/g, (_, k) => o[k] ?? '');

const MOODS = {
  santai: { talk: 0.85, pre: ['', '', 'Santai dulu ya, ', 'Hmm, '], post: ['', '', ' wkwk', ' 😅'] },
  curigaan: { talk: 1.0, pre: ['', 'Hmm... ', 'Bentar, ', 'Jujur ya, '], post: ['', '', ' 🤨', '.'] },
  heboh: { talk: 1.15, pre: ['', 'WOY! ', 'Eh eh, ', 'Gila sih, '], post: ['!!', '!', ' 😱', '!! 🔥'] },
  pendiam: { talk: 0.45, pre: ['', '', ''], post: ['', '.', '...'] },
  bijak: { talk: 0.8, pre: ['Menurutku, ', 'Coba kita pikir, ', '', 'Tenang dulu. '], post: ['', '.', ' 🙏'] },
};
const T = {
  greet: ['Semoga aku bukan serigala wkwk', 'Bismillah, semoga desa aman', 'Siap-siap, jangan ada yang bohong ya', 'Yuk main yang jujur semua', 'Aku deg-degan nih'],
  dead1: ['Innalillahi... {victim} dibunuh semalam 😢', 'Ya ampun {victim}! Siapa yang tega?', 'Serius {victim} mati? Padahal dia baik', 'RIP {victim}. Kita harus cari pelakunya'],
  deadMany: ['Banyak banget yang mati semalam...', 'Desa makin sepi, kita harus cepat nemuin serigalanya'],
  noDeath: ['Alhamdulillah semalam nggak ada yang mati', 'Aman semalam, kayaknya ada yang dilindungi', 'Wah selamat semua, Doctor kerja bagus nih'],
  accuse: ['Aku curiga sama {target}', '{target} dari tadi diem aja, mencurigakan', 'Gerak-gerik {target} aneh menurutku', 'Feeling aku sih {target} serigalanya', '{target}, kamu semalam ngapain?', 'Kita vote {target} aja gimana?', 'Coba jelasin dong {target}, kok kamu tenang banget'],
  accuseStrong: ['Aku yakin banget {target} itu serigala', 'Fix {target}. Udah jelas', 'Jangan ragu, vote {target}!'],
  agree: ['Setuju sama {speaker}, {target} emang aneh', 'Iya, aku juga mikir gitu soal {target}', 'Bener tuh, {target} mencurigakan', 'Aku ikut {speaker}, vote {target}'],
  disagree: ['Jangan buru-buru nuduh {target}, buktinya apa?', 'Hmm aku nggak yakin {target} serigala', '{target} kayaknya warga deh', 'Kok langsung {target} sih? Aneh juga yang nuduh'],
  defend: ['Hah? Kok aku sih {speaker}? Aku warga biasa!', 'Sumpah bukan aku!', 'Aku dari tadi bantuin mikir, masa aku dituduh', 'Salah orang {speaker}, aku bukan serigala', 'Tenang, aku bisa jelasin. Aku bukan serigala'],
  counter: ['Justru kamu yang aneh, {speaker}. Kenapa buru-buru nuduh aku?', 'Yang nuduh duluan biasanya serigala lho, {speaker}', '{speaker} ngalihin perhatian nih'],
  answer: ['Aku sih curiga sama {target}', 'Belum yakin, tapi {target} agak aneh', 'Kalau aku, vote {target}'],
  seerWolf: ['Oke aku buka kartu: aku SEER. Semalam aku terawang {target}, dia SERIGALA!', 'Aku Seer. {target} itu serigala, aku udah cek!', 'Percaya sama aku, aku Seer. {target} serigala, vote dia!'],
  seerClean: ['{target} bersih, aku udah cek', 'Jangan vote {target}, dia warga. Percaya aku', 'Aku tahu {target} bukan serigala'],
  fakeSeer: ['Bohong! Aku yang Seer sebenarnya. {target} itu serigala!', 'Jangan percaya dia, aku Seer asli dan {target} serigala'],
  claimDoc: ['Aku Doctor, semalam aku yang jaga. Jangan vote aku', 'Aku Doctor, kalau aku mati nggak ada yang ngelindungin lagi'],
  hurry: ['Ayo cepet tentuin, waktunya mau habis!', 'Udah, kita vote sekarang aja', 'Waktu tinggal dikit, fokus ke yang paling mencurigakan'],
  voteSay: ['Aku pilih {target}', 'Vote {target}', 'Aku vote {target}, maaf ya', '{target}. Final.'],
  execWolf: ['Mampus! Bener kan dia serigala 😤', 'YES! Satu serigala tumbang', 'Mantap desa, kerja bagus semua'],
  execGood: ['Yah... salah orang 😢', 'Aduh, ternyata warga. Maaf ya', 'Kita kena tipu serigala nih'],
  wolfPlan: ['Malam ini {target} aja gimana?', 'Kita makan {target}, dia bahaya', 'Target {target} ya, dia mulai curiga ke kita'],
  wolfOk: ['Oke setuju', 'Gas', 'Sip, {target}', 'Aman, ikut'],
  win: ['GG semua!', 'Akhirnya menang 🎉', 'Mantap timku!', 'GG WP, seru banget'],
  lose: ['GG, next ronde aku balas', 'Yah kalah... GG', 'Kurang teliti nih kita', 'GG, serigalanya jago'],
  ghost: ['Aku mati penasaran... {target} itu mencurigakan', 'Dari sini kelihatan jelas, hati-hati sama {target}'],
};
/** rapikan kalimat: huruf kecil setelah awalan, tanpa tanda baca dobel */
function polish(pre, txt, post, names) {
  let t = txt;
  const w0 = (t.match(/^[A-Za-z]+/) || [''])[0];
  const keepCase = /[A-Z].*[A-Z]/.test(w0) || (names || []).some((n) => n.toLowerCase() === w0.toLowerCase());
  if (pre && /,\s$/.test(pre) && !keepCase) t = t.charAt(0).toLowerCase() + t.slice(1);
  if (/[.!?]$/.test(t) && /^[.!?]/.test(post)) t = t.replace(/[.!?]+$/, '');
  if (post.trim() && t.trim().endsWith(post.trim())) post = ''; // hindari emoji/akhiran dobel
  return (pre + t + post).replace(/(?<!\.)\.\.(?!\.)/g, '.').replace(/!\./g, '!').replace(/\?\./g, '?').replace(/!{3,}/g, '!!');
}
const ACCUSE_RE = /curiga|serigala|wolf|bohong|vote|pilih|eksekusi|gantung|aneh|mencurigakan|\bsus\b|pelaku|fix/i;
const DEFEND_RE = /bukan|percaya|aman|warga|bersih|innocent|baik/i;

// level kecerdasan bot
export const LEVELS = {
  easy: { noise: 3.5, seerClaim: 0.3, weight: 0.5, fakeSeer: 0.1, randomVote: 0.45, talk: 0.8 },
  normal: { noise: 1.5, seerClaim: 0.75, weight: 1, fakeSeer: 0.35, randomVote: 0.12, talk: 1 },
  hard: { noise: 0.5, seerClaim: 1, weight: 1.6, fakeSeer: 0.55, randomVote: 0, talk: 1.1 },
};

export class BotChat {
  constructor(game) { this.g = game; this.recent = []; this.win = 10000; this.cool = 1; }
  get on() { return this.g.settings.botChat !== false; }
  get level() { return this.g.settings.botLevel || 'normal'; }
  get L() { return LEVELS[this.level] || LEVELS.normal; }
  bots(alive = true) { return [...this.g.players.values()].filter((p) => p.isBot && p.role && (!alive || p.alive)); }

  /** dipanggil saat game mulai (setelah peran dibagi) */
  init() {
    const moods = Object.keys(MOODS);
    for (const b of this.bots(false)) {
      const sus = {};
      for (const p of this.g.seated) if (p.id !== b.id) sus[p.id] = Math.random() * this.L.noise;
      if (b.role === 'werewolf') for (const p of this.g.seated) if (p.role === 'werewolf' && p.id !== b.id) sus[p.id] = -99;
      b.brain = { mood: pick(moods), sus, claimed: false, scapegoat: null, lastTalk: 0 };
    }
    this.prevAlive = new Set(this.g.alive.map((p) => p.id));
  }

  // ---------------- bicara ----------------
  speak(b, key, o = {}, delay = 0) {
    if (!this.on || !b?.brain) return;
    this.g.botTimers.push(setTimeout(() => {
      const g = this.g;
      if (!b.alive && g.phase !== 'end' && key !== 'ghost') return;
      // batasi keramaian: maksimal 4 pesan bot per 10 detik
      const now = Date.now(); this.recent = this.recent.filter((t) => now - t < this.win);
      if (this.recent.length >= 4 && key !== 'seerWolf' && key !== 'defend') return;
      // batasi bela diri: maksimal 2× per bot per fase
      if (key === 'defend' || key === 'counter') { b.brain.defends = (b.brain.defends || 0) + 1; if (b.brain.defends > 2) return; }
      const m = MOODS[b.brain.mood];
      // hindari kalimat kembar dengan pesan terakhir
      this.said = this.said || [];
      let txt = fill(pick(T[key]), o);
      for (let k = 0; k < 4 && this.said.includes(txt); k++) txt = fill(pick(T[key]), o);
      if (this.said.includes(txt) && key !== 'seerWolf') return;
      this.said.push(txt); if (this.said.length > 14) this.said.shift();
      const out = (key === 'wolfPlan' || key === 'wolfOk' || key === 'voteSay') ? txt : polish(pick(m.pre), txt, ['dead1', 'deadMany', 'execGood', 'lose'].includes(key) ? pick(['', '', ' 😢']) : pick(m.post), g.seated.map((p) => base(p.name)));
      // niat pesan bot diteruskan langsung ke bot lain (tidak ditebak dari kata kunci)
      this.intent = { key, target: o.targetId || null, speakerTarget: o.speakerId || null };
      const r = g.say(b.id, out);
      this.intent = null;
      if (r?.ok) { this.recent.push(now); b.brain.lastTalk = now; }
    }, delay));
  }
  nameOf(id) { return base(this.g.players.get(id)?.name); }
  topSuspect(b, exclude = []) {
    const pool = this.g.alive.filter((p) => p.id !== b.id && !exclude.includes(p.id));
    if (!pool.length) return null;
    if (b.role === 'werewolf') {
      const nonWolf = pool.filter((p) => p.role !== 'werewolf');
      if (b.brain.scapegoat && nonWolf.some((p) => p.id === b.brain.scapegoat)) return b.brain.scapegoat;
      const t = nonWolf.sort((x, y) => (this.pressure(y.id) - this.pressure(x.id)) || (Math.random() - 0.5))[0];
      return t?.id || null;
    }
    return pool.sort((x, y) => (b.brain.sus[y.id] || 0) - (b.brain.sus[x.id] || 0))[0].id;
  }
  /** seberapa banyak bot lain mencurigai seseorang (dipakai serigala untuk mencari kambing hitam) */
  pressure(id) { let s = 0; for (const o of this.bots()) if (o.role !== 'werewolf') s += o.brain?.sus[id] || 0; return s; }
  bump(id, d, except) { for (const b of this.bots()) if (b.id !== except && b.brain && b.brain.sus[id] > -50) b.brain.sus[id] = (b.brain.sus[id] || 0) + d; }

  // ---------------- fase ----------------
  onPhase(phase) {
    if (!this.on) return;
    const g = this.g, bots = this.bots();
    for (const b of bots) if (b.brain) b.brain.defends = 0;
    if (phase === 'reveal') bots.forEach((b) => chance(0.35) && this.speak(b, 'greet', {}, 1200 + Math.random() * 5000));
    if (phase === 'day') {
      const nowAlive = new Set(g.alive.map((p) => p.id));
      const died = [...(this.prevAlive || [])].filter((id) => !nowAlive.has(id));
      this.prevAlive = nowAlive;
      // tersangka korban: korban yang mati dikenal perannya (bila dibuka) memengaruhi kecurigaan sedikit
      const dayLen = (g.settings.timers.day || 90) * 1000;
      let first = true;
      for (const b of bots) {
        const m = MOODS[b.brain.mood];
        if (chance(0.8 * m.talk)) {
          if (died.length === 1) this.speak(b, 'dead1', { victim: this.nameOf(died[0]) }, 1500 + Math.random() * 5000);
          else if (died.length > 1) this.speak(b, 'deadMany', {}, 1500 + Math.random() * 5000);
          else if (first && chance(0.6)) this.speak(b, 'noDeath', {}, 1500 + Math.random() * 4000);
          first = false;
        }
        // Seer membuka hasil terawangan
        const found = b.role === 'seer' && b.notes?.find((n) => n.wolf && g.players.get(n.target)?.alive);
        if (found && !b.brain.claimed && chance(this.L.seerClaim)) {
          b.brain.claimed = true;
          this.speak(b, 'seerWolf', { target: this.nameOf(found.target), targetId: found.target }, 7000 + Math.random() * 6000);
          this.bump(found.target, 3.5 * this.L.weight, b.id);
          continue;
        }
        if (b.role === 'werewolf' && !b.brain.scapegoat) b.brain.scapegoat = this.topSuspect(b);
        // tuduhan pertama & kedua
        const t1 = this.topSuspect(b);
        if (t1 && chance(0.85 * m.talk)) this.speak(b, chance(0.2) ? 'accuseStrong' : 'accuse', { target: this.nameOf(t1), targetId: t1 }, 9000 + Math.random() * dayLen * 0.4);
        const t2 = this.topSuspect(b);
        if (t2 && chance(0.45 * m.talk)) this.speak(b, 'accuse', { target: this.nameOf(t2), targetId: t2 }, dayLen * 0.5 + Math.random() * dayLen * 0.3);
        if (b.brain.mood === 'heboh' && chance(0.6)) this.speak(b, 'hurry', {}, dayLen - 9000);
      }
      // arwah bot sesekali bicara di saluran arwah
      for (const d of this.bots(false).filter((p) => !p.alive)) if (chance(0.2)) { const t = this.topSuspect(d); if (t) this.speak(d, 'ghost', { target: this.nameOf(t) }, 5000 + Math.random() * dayLen * 0.6); }
    }
    if (phase === 'vote') for (const b of bots) if (chance(0.45 * MOODS[b.brain.mood].talk)) { const t = this.voteTarget(b); if (t && t !== 'skip') this.speak(b, 'voteSay', { target: this.nameOf(t), targetId: t }, 800 + Math.random() * 4000); }
    if (phase === 'verdict') {
      const ex = g.lastExecuted && g.players.get(g.lastExecuted);
      if (ex) {
        const wolf = ex.role === 'werewolf', known = g.settings.revealRoles;
        // pemilih yang menggiring ke warga tak bersalah jadi dicurigai; pemilih yang benar dipercaya
        if (known) for (const [voter, target] of Object.entries(g.votes || {})) if (target === ex.id) this.bump(voter, (wolf ? -1.5 : 1.8) * this.L.weight);
        for (const b of bots) if (chance(0.5 * MOODS[b.brain.mood].talk) && b.role !== 'werewolf') this.speak(b, known ? (wolf ? 'execWolf' : 'execGood') : 'execGood', {}, 600 + Math.random() * 3500);
      }
    }
    if (phase === 'night') {
      const wolves = bots.filter((b) => b.role === 'werewolf');
      if (wolves.length) {
        const lead = wolves[0], t = this.wolfTarget(lead);
        if (t) {
          lead.brain.plan = t; wolves.forEach((w) => (w.brain.plan = t));
          if (wolves.length > 1 || g.alive.some((p) => p.role === 'werewolf' && !p.isBot)) {
            this.speak(lead, 'wolfPlan', { target: this.nameOf(t) }, 2000 + Math.random() * 3000);
            wolves.slice(1).forEach((w) => this.speak(w, 'wolfOk', { target: this.nameOf(t) }, 5500 + Math.random() * 3000));
          }
        }
      }
    }
    if (phase === 'end') {
      for (const b of this.bots(false)) if (chance(0.55)) {
        const won = (b.role === 'werewolf') === (g.winner === 'wolf');
        this.speak(b, won ? 'win' : 'lose', {}, 1500 + Math.random() * 6000);
      }
    }
  }

  /** target makan malam serigala: yang paling berbahaya (mengaku Seer / paling curiga ke serigala) */
  wolfTarget(w) {
    const g = this.g, pool = g.alive.filter((p) => p.role !== 'werewolf');
    if (!pool.length) return null;
    const claimer = pool.find((p) => p.isBot ? p.brain?.claimed : this.humanClaims?.has(p.id));
    if (claimer && chance(0.8)) return claimer.id;
    const danger = (p) => (p.isBot && p.brain ? Object.entries(p.brain.sus).filter(([id]) => g.players.get(id)?.role === 'werewolf').reduce((s, [, v]) => s + Math.max(0, v), 0) : 1) + Math.random();
    return pool.sort((a, b) => danger(b) - danger(a))[0].id;
  }
  /** Seer yang sudah mengaku (bot atau manusia) — dilindungi Doctor/Guardian di level hard */
  claimedSeer() { return this.g.alive.find((p) => (p.isBot && p.role === 'seer' && p.brain?.claimed) || this.humanClaims?.has(p.id)); }
  /** keputusan aksi malam; null = pakai perilaku acak bawaan (level easy) */
  nightAction(b) {
    if (this.level === 'easy' || !b.brain) return null;
    const g = this.g, hard = this.level === 'hard', others = g.alive.filter((p) => p.id !== b.id);
    if (!others.length) return null;
    switch (b.role) {
      case 'werewolf': { const t = b.brain.plan && g.players.get(b.brain.plan)?.alive ? b.brain.plan : this.wolfTarget(b); return t ? { target: t } : null; }
      case 'seer': {
        const checked = new Set((b.notes || []).map((n) => n.target));
        const pool = others.filter((p) => !checked.has(p.id));
        if (!pool.length) return { target: pick(others).id };
        const t = hard ? pool.sort((x, y) => (b.brain.sus[y.id] || 0) - (b.brain.sus[x.id] || 0))[0] : pick(pool);
        return { target: t.id };
      }
      case 'doctor': case 'guardian': {
        const seer = this.claimedSeer();
        const ok = (p) => p && p.alive && !(b.role === 'doctor' && p.id === b.lastProtect) && !(b.role === 'guardian' && p.id === b.id);
        if (seer && ok(seer) && chance(hard ? 0.9 : 0.5)) return { target: seer.id };
        // lindungi orang yang paling dipercaya (kecurigaan terendah)
        const pool = g.alive.filter(ok);
        if (!pool.length) return null;
        const t = hard ? pool.sort((x, y) => (b.brain.sus[x.id] || 0) - (b.brain.sus[y.id] || 0))[0] : pick(pool);
        return { target: t.id };
      }
      case 'hunter': {
        const t = this.topSuspect(b), s = t ? b.brain.sus[t] || 0 : 0;
        if (t && s > (hard ? 2.5 : 1.8) && chance(hard ? 1 : 0.6)) return { target: t };
        return { type: 'skip' };
      }
      default: return null;
    }
  }
  voteTarget(b) {
    const g = this.g, known = b.notes?.find((n) => n.wolf && g.players.get(n.target)?.alive);
    if (known) return known.target;
    if (chance(this.L.randomVote)) { const pool = g.alive.filter((p) => p.id !== b.id && !(b.role === 'werewolf' && p.role === 'werewolf')); return pool.length ? pick(pool).id : 'skip'; }
    const t = this.topSuspect(b);
    if (!t) return 'skip';
    if (b.role !== 'werewolf' && (b.brain.sus[t] || 0) < 0.6 && chance(0.4)) return 'skip';
    return t;
  }

  // ---------------- reaksi pada chat ----------------
  onChat(m) {
    if (!this.on || !m || m.sys || m.channel !== 'all') return;
    const g = this.g, speaker = g.players.get(m.id);
    if (!speaker || !['day', 'vote'].includes(g.phase)) return;
    const text = String(m.text || ''), low = text.toLowerCase();
    let mentioned, accusing, defending, claimSeer;
    const it = speaker.isBot ? this.intent : null;
    if (it) {
      // pesan bot: niatnya sudah diketahui pasti
      const tid = it.target || it.speakerTarget, tp = tid && g.players.get(tid);
      mentioned = tp && tp.alive ? [tp] : [];
      accusing = ['accuse', 'accuseStrong', 'voteSay', 'counter', 'agree', 'seerWolf', 'fakeSeer', 'answer'].includes(it.key);
      defending = ['disagree', 'seerClean'].includes(it.key);
      claimSeer = it.key === 'seerWolf' || it.key === 'fakeSeer';
      if (it.key === 'defend') return;
    } else {
      mentioned = g.alive.filter((p) => p.id !== m.id && base(p.name).length >= 3 && low.includes(base(p.name).toLowerCase()));
      accusing = ACCUSE_RE.test(text); defending = DEFEND_RE.test(text);
      claimSeer = /\b(aku|gue|gw|saya)\b.*\bseer\b/i.test(text);
    }
    if (claimSeer && !speaker.isBot) { this.humanClaims = this.humanClaims || new Set(); this.humanClaims.add(m.id); }
    const fromBot = speaker.isBot;
    for (const t of mentioned) {
      // pendengar ikut terpengaruh (kredibilitas pembicara memengaruhi bobot)
      for (const b of this.bots()) {
        if (b.id === m.id || !b.brain || b.brain.sus[t.id] <= -50) continue;
        const cred = 1 - Math.min(0.8, Math.max(0, (b.brain.sus[m.id] || 0) / 4));
        // level hard lebih memperhitungkan kredibilitas; easy gampang terpengaruh siapa saja
        const w = this.level === 'hard' ? cred * cred : this.level === 'easy' ? 1 : cred;
        if (accusing && !defending) b.brain.sus[t.id] = (b.brain.sus[t.id] || 0) + (claimSeer ? 2.5 : 0.7) * w;
        if (defending && !accusing) b.brain.sus[t.id] = (b.brain.sus[t.id] || 0) - 0.5 * w;
      }
      // bot yang dituduh membela diri
      if (t.isBot && t.brain && accusing && !defending && Date.now() - t.brain.lastTalk > 4000 * this.cool) {
        t.brain.sus[m.id] = (t.brain.sus[m.id] || 0) + 1.2;
        this.speak(t, chance(t.role === 'werewolf' ? 0.55 : 0.3) ? 'counter' : 'defend', { speaker: base(speaker.name), speakerId: speaker.id }, 1500 + Math.random() * 3000);
        if (t.role === 'doctor' && !t.brain.claimed && chance(0.25)) { t.brain.claimed = true; this.speak(t, 'claimDoc', {}, 5000 + Math.random() * 3000); }
        continue;
      }
      if (fromBot && chance(0.5)) continue; // kurangi rantai obrolan bot-ke-bot
      // satu bot lain menanggapi tuduhan: setuju / tidak setuju / serigala membela teman
      if (accusing && !defending) {
        const responders = this.bots().filter((b) => b.id !== m.id && b.id !== t.id && Date.now() - b.brain.lastTalk > 6000 * this.cool);
        const r = responders.length && chance(0.55) ? pick(responders) : null;
        if (r) {
          const wolfMate = r.role === 'werewolf' && t.role === 'werewolf';
          const s = r.brain.sus[t.id] || 0;
          // Seer bot yang sudah mengecek orang itu bersih akan membela
          const clean = r.role === 'seer' && r.notes?.some((n) => n.target === t.id && !n.wolf);
          if (clean) this.speak(r, 'seerClean', { target: base(t.name), targetId: t.id }, 2500 + Math.random() * 3000);
          else if (wolfMate || s < 0.8) this.speak(r, 'disagree', { target: base(t.name), targetId: t.id }, 2500 + Math.random() * 3500);
          else this.speak(r, 'agree', { target: base(t.name), speaker: base(speaker.name), targetId: t.id }, 2500 + Math.random() * 3500);
          // serigala bisa mengaku Seer palsu untuk melawan Seer asli
          if (claimSeer && r.role === 'werewolf' && t.role === 'werewolf' && !r.brain.claimed && chance(this.L.fakeSeer)) { r.brain.claimed = true; this.speak(r, 'fakeSeer', { target: base(speaker.name), targetId: speaker.id }, 6000 + Math.random() * 3000); }
        }
      }
    }
    // pertanyaan umum tanpa nama ("siapa nih serigalanya?") → satu bot menjawab
    if (!mentioned.length && /\?|siapa|gimana|pendapat/i.test(text) && !fromBot) {
      const r = this.bots().find((b) => Date.now() - b.brain.lastTalk > 5000 * this.cool && chance(0.6));
      if (r) { const t = this.topSuspect(r); if (t) this.speak(r, 'answer', { target: this.nameOf(t), targetId: t }, 2000 + Math.random() * 3000); }
    }
  }
}
