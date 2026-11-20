// =====================================================================
//  Werewolf game engine — murni JS, dipakai server (online) & client (offline)
// =====================================================================

export const ROLES = {
  werewolf: { name: 'Werewolf', team: 'wolf', icon: '🐺', faction: 'Faksi Serigala', desc: 'Malam hari bersama serigala lain memangsa 1 warga. Bisa chat rahasia dengan sesama serigala.' },
  seer: { name: 'Seer', team: 'village', icon: '🔮', faction: 'Faksi Warga', desc: 'Malam hari menerawang 1 warga: apakah dia Werewolf?' },
  doctor: { name: 'Doctor', team: 'village', icon: '🩺', faction: 'Faksi Warga', desc: 'Malam hari melindungi 1 warga (boleh diri sendiri) dari serangan. Tidak boleh orang yang sama 2 malam berturut-turut.' },
  hunter: { name: 'Hunter', team: 'village', icon: '🏹', faction: 'Faksi Warga', desc: 'Saat mati (dimangsa atau dieksekusi), langsung menembakkan panah terakhir ke 1 pemain.' },
  judge: { name: 'Hakim', team: 'village', icon: '⚖️', faction: 'Faksi Warga', desc: 'Memiliki bobot suara ganda saat voting siang.' },
  guardian: { name: 'Guardian', team: 'village', icon: '🛡️', faction: 'Faksi Warga', desc: 'Mengawal 1 warga tiap malam. Jika warga itu diserang, Guardian yang gugur menggantikannya.' },
  witch: { name: 'Witcher', team: 'village', icon: '🧪', faction: 'Faksi Warga', desc: 'Punya 1 ramuan penyembuh (selamatkan korban malam ini) dan 1 ramuan racun (bunuh 1 pemain). Masing-masing sekali per game.' },
  villager: { name: 'Villager', team: 'village', icon: '🧑‍🌾', faction: 'Faksi Warga', desc: 'Siang hari berdiskusi & voting untuk mengeliminasi Werewolf.' },
  moderator: { name: 'Moderator', team: 'none', icon: '🎙️', faction: 'Pemandu Desa', desc: 'Memandu permainan, melihat semua peran & aksi, mengatur fase, dan bisa mengeluarkan pemain.' },
};
export const SPECIALS = ['seer', 'doctor', 'hunter', 'judge', 'guardian', 'witch'];
export const NIGHT_ROLES = ['werewolf', 'seer', 'doctor', 'guardian', 'witch'];

export const PHASES = {
  lobby: 'Lobby', reveal: 'Pembagian Peran', night: 'Malam', dawn: 'Fajar', day: 'Diskusi Siang',
  vote: 'Voting', verdict: 'Putusan', hunter: 'Panah Hunter', end: 'Selesai',
};

const BOT_NAMES = ['Bima', 'Sari', 'Dewi', 'Agus', 'Rina', 'Joko', 'Putri', 'Bayu', 'Lestari', 'Andi', 'Wulan', 'Eko', 'Fitri', 'Gilang', 'Hana', 'Indra'];
export const COLORS = ['#c0392b', '#2980b9', '#27ae60', '#8e44ad', '#d35400', '#16a085', '#f1c40f', '#7f8c8d', '#e84393', '#00cec9', '#6c5ce7', '#fd9644', '#a3cb38', '#b53471', '#1289a7', '#c4e538'];

const MAX_PLAYERS = 16, MIN_PLAYERS = 4;

const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const clean = (s, n) => String(s ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, n);

export class Game {
  /**
   * @param {object} o {code, name, hostId, hostName, hostIsMod, isPublic, onChange}
   */
  constructor(o) {
    this.code = o.code;
    this.name = clean(o.name, 30) || 'Desa ' + o.code;
    this.isPublic = o.isPublic !== false;
    this.onChange = o.onChange || (() => {});
    this.hostId = o.hostId;
    this.modId = o.hostIsMod ? o.hostId : null;
    this.players = new Map(); // id -> player
    this.settings = {
      wolves: 1,
      roles: { seer: true, doctor: true, hunter: true, judge: true, guardian: false, witch: false },
      timers: { night: 45, day: 90, vote: 40 },
      revealRoles: true,
    };
    this.phase = 'lobby';
    this.day = 0;
    this.deadline = 0;
    this.paused = false;
    this.pausedLeft = 0;
    this.log = [];
    this.chat = [];
    this.winner = null;
    this.timer = null;
    this.botTimers = [];
    this.createdAt = Date.now();
    this.addPlayer(o.hostId, o.hostName);
  }

  // ---------------- util ----------------
  emit() { this.onChange(this); }
  isMod(id) { return id === this.modId; }
  isHost(id) { return id === this.hostId; }
  canControl(id) { return this.isHost(id) || this.isMod(id); }
  get seated() { return [...this.players.values()].filter((p) => p.id !== this.modId); }
  get alive() { return this.seated.filter((p) => p.alive); }
  aliveWolves() { return this.alive.filter((p) => p.role === 'werewolf'); }
  announce(text, kind = 'info') { this.log.push({ t: Date.now(), text, kind }); if (this.log.length > 80) this.log.shift(); }
  sys(text, channel = 'all') { this.pushChat({ id: 'sys', name: 'Moderator Desa', text, channel, sys: true }); }
  pushChat(m) { m.t = Date.now(); m.n = (this.chatSeq = (this.chatSeq || 0) + 1); this.chat.push(m); if (this.chat.length > 200) this.chat.shift(); }

  // ---------------- lobby ----------------
  addPlayer(id, name, isBot = false) {
    if (this.players.has(id)) {
      const p = this.players.get(id); p.connected = true; if (name) p.name = clean(name, 16) || p.name;
      return { ok: true, rejoin: true };
    }
    if (this.phase !== 'lobby') return { ok: false, error: 'Game sudah berjalan. Tunggu ronde berikutnya.' };
    if (this.seated.length >= MAX_PLAYERS && id !== this.modId) return { ok: false, error: 'Room penuh (maks 16 pemain).' };
    let nm = clean(name, 16) || 'Warga';
    const names = new Set([...this.players.values()].map((p) => p.name.toLowerCase()));
    let base = nm, k = 2; while (names.has(nm.toLowerCase())) nm = `${base} ${k++}`;
    const used = new Set([...this.players.values()].map((p) => p.color));
    const color = COLORS.find((c) => !used.has(c)) || pick(COLORS);
    this.players.set(id, { id, name: nm, isBot, connected: true, alive: true, role: null, color, joinedAt: Date.now() });
    if (id !== this.modId) this.sys(`${nm} bergabung ke desa.`);
    this.autoWolves();
    this.emit();
    return { ok: true };
  }

  removePlayer(id, reason = 'keluar') {
    const p = this.players.get(id);
    if (!p) return;
    if (this.phase === 'lobby' || this.phase === 'end') {
      this.players.delete(id);
    } else {
      // di tengah game: tandai mati & terputus agar tidak menghambat
      p.connected = false;
      if (p.alive && id !== this.modId) { p.alive = false; p.diedDay = this.day; this.announce(`${p.name} meninggalkan desa (${reason}).`, 'death'); }
    }
    if (id !== this.modId) this.sys(`${p.name} ${reason === 'dikeluarkan' ? 'dikeluarkan dari room' : 'meninggalkan room'}.`);
    if (id === this.modId) { this.modId = null; this.players.delete(id); this.sys('Moderator meninggalkan room. Game berjalan otomatis dengan timer.'); }
    if (id === this.hostId) {
      const next = [...this.players.values()].find((x) => !x.isBot && x.connected && x.id !== id);
      this.hostId = next ? next.id : null;
      if (next) this.sys(`${next.name} sekarang menjadi Host.`);
    }
    this.autoWolves();
    if (this.phase !== 'lobby' && this.phase !== 'end') { this.checkEarly(); if (!this.winner) this.checkWin(true); }
    this.emit();
  }

  setConnected(id, on) { const p = this.players.get(id); if (p) { p.connected = on; this.emit(); } }
  get humanCount() { return [...this.players.values()].filter((p) => !p.isBot && p.connected).length; }

  addBot(by) {
    if (!this.canControl(by) || this.phase !== 'lobby') return;
    const used = new Set([...this.players.values()].map((p) => p.name));
    const name = BOT_NAMES.find((n) => !used.has(n + ' 🤖')) || 'Bot';
    this.addPlayer('bot_' + Math.random().toString(36).slice(2, 8), name + ' 🤖', true);
  }
  kick(by, target) {
    if (!this.canControl(by) || target === by) return;
    const p = this.players.get(target); if (!p) return;
    this.kicked = this.kicked || new Set(); if (!p.isBot) this.kicked.add(target);
    this.removePlayer(target, 'dikeluarkan');
    return true;
  }
  autoWolves() {
    if (this.phase !== 'lobby') return;
    const n = this.seated.length;
    if (!this.wolvesManual) this.settings.wolves = Math.max(1, Math.floor(n / 4));
  }
  setSettings(by, s) {
    if (!this.canControl(by) || this.phase !== 'lobby') return;
    if (s.wolves != null) { this.settings.wolves = Math.max(1, Math.min(5, s.wolves | 0)); this.wolvesManual = true; }
    if (s.roles) for (const r of SPECIALS) if (r in s.roles) this.settings.roles[r] = !!s.roles[r];
    if (s.timers) for (const k of ['night', 'day', 'vote']) if (s.timers[k]) this.settings.timers[k] = Math.max(15, Math.min(300, s.timers[k] | 0));
    if ('revealRoles' in s) this.settings.revealRoles = !!s.revealRoles;
    if ('isPublic' in s) this.isPublic = !!s.isPublic;
    this.emit();
  }
  setModerator(by, on) {
    if (!this.isHost(by) || this.phase !== 'lobby') return;
    this.modId = on ? by : null;
    this.autoWolves();
    this.emit();
  }

  plannedRoles() {
    const n = this.seated.length;
    const wolves = Math.min(this.settings.wolves, Math.max(1, Math.floor((n - 1) / 2)));
    const roles = Array(wolves).fill('werewolf');
    for (const r of SPECIALS) if (this.settings.roles[r] && roles.length < n) roles.push(r);
    while (roles.length < n) roles.push('villager');
    return roles;
  }

  start(by) {
    if (!this.canControl(by)) return { ok: false, error: 'Hanya Host/Moderator yang bisa memulai.' };
    if (this.phase !== 'lobby' && this.phase !== 'end') return { ok: false };
    const seats = this.seated;
    if (seats.length < MIN_PLAYERS) return { ok: false, error: `Minimal ${MIN_PLAYERS} pemain (tambahkan bot jika kurang).` };
    const roles = shuffle(this.plannedRoles());
    shuffle([...seats]).forEach((p, i) => {
      Object.assign(p, { role: roles[i], alive: true, diedDay: null, notes: [], lastProtect: null, potions: { heal: true, poison: true } });
    });
    if (this.modId) this.players.get(this.modId).role = 'moderator';
    this.day = 0; this.winner = null; this.log = []; this.chat = this.chat.slice(-10);
    this.announce('Permainan dimulai. Periksa kartu peranmu!', 'phase');
    this.sys(`Permainan dimulai dengan ${seats.length} pemain: ${this.roleSummary(roles)}.`);
    this.setPhase('reveal', 8);
    return { ok: true };
  }
  roleSummary(roles) {
    const c = {}; roles.forEach((r) => (c[r] = (c[r] || 0) + 1));
    return Object.entries(c).map(([r, n]) => `${n} ${ROLES[r].name}`).join(', ');
  }

  // ---------------- fase & timer ----------------
  setPhase(phase, seconds) {
    clearTimeout(this.timer);
    this.botTimers.forEach(clearTimeout); this.botTimers = [];
    this.phase = phase;
    this.paused = false;
    this.deadline = seconds ? Date.now() + seconds * 1000 : 0;
    if (seconds) this.timer = setTimeout(() => this.onTimeout(), seconds * 1000);
    if (phase === 'night') this.beginNight();
    if (phase === 'vote') { this.votes = {}; this.scheduleBots('vote'); }
    if (phase === 'hunter') this.scheduleBots('hunter');
    this.emit();
  }
  onTimeout() {
    if (this.paused) return;
    switch (this.phase) {
      case 'reveal': this.setPhase('night', this.settings.timers.night); break;
      case 'night': this.resolveNight(); break;
      case 'dawn': this.afterDeaths('day'); break;
      case 'day': this.announce('Waktu diskusi habis. Saatnya voting!', 'phase'); this.setPhase('vote', this.settings.timers.vote); break;
      case 'vote': this.resolveVote(); break;
      case 'verdict': this.afterDeaths('night'); break;
      case 'hunter': this.hunterShoot(this.hunterId, null, true); break;
    }
  }
  pause(by) {
    if (!this.canControl(by) || !this.deadline) return;
    if (!this.paused) { this.paused = true; this.pausedLeft = Math.max(1000, this.deadline - Date.now()); clearTimeout(this.timer); this.sys('⏸ Timer dijeda oleh moderator.'); }
    else { this.paused = false; this.deadline = Date.now() + this.pausedLeft; this.timer = setTimeout(() => this.onTimeout(), this.pausedLeft); this.sys('▶ Timer dilanjutkan.'); }
    this.emit();
  }
  advance(by) { if (this.canControl(by) && this.phase !== 'lobby' && this.phase !== 'end') { this.paused = false; this.onTimeout(); } }
  restart(by) {
    if (!this.canControl(by)) return;
    clearTimeout(this.timer); this.botTimers.forEach(clearTimeout);
    for (const p of this.players.values()) { p.alive = true; p.role = null; }
    for (const p of [...this.players.values()]) if (!p.connected && !p.isBot) this.players.delete(p.id);
    this.phase = 'lobby'; this.deadline = 0; this.winner = null; this.day = 0;
    this.sys('Permainan diulang. Kembali ke lobby.');
    this.emit();
  }

  // ---------------- malam ----------------
  beginNight() {
    this.day++;
    this.night = { wolfVotes: {}, see: {}, protect: null, guard: null, heal: false, poison: null, done: new Set() };
    this.announce(`🌙 Malam ke-${this.day}. Desa tertidur…`, 'phase');
    this.sys(`Malam ke-${this.day} tiba. Para peran malam, lakukan aksimu.`);
    this.scheduleBots('night');
  }
  nightActors() { return this.alive.filter((p) => NIGHT_ROLES.includes(p.role) && !(p.role === 'witch' && !p.potions.heal && !p.potions.poison)); }
  wolfTarget() {
    const tally = {};
    for (const w of this.aliveWolves()) { const t = this.night.wolfVotes[w.id]; if (t) tally[t] = (tally[t] || 0) + 1; }
    const max = Math.max(0, ...Object.values(tally));
    if (!max) return null;
    const top = Object.keys(tally).filter((k) => tally[k] === max);
    return top.length === 1 ? top[0] : (this.night.wolfTie ||= pick(top));
  }

  act(id, a = {}) {
    const p = this.players.get(id);
    if (!p || !p.alive || this.phase !== 'night' || !this.night) return { ok: false };
    const n = this.night, t = a.target ? this.players.get(a.target) : null;
    const validTarget = t && t.alive && t.id !== this.modId;
    switch (p.role) {
      case 'werewolf':
        if (!validTarget || t.role === 'werewolf') return { ok: false, error: 'Pilih warga yang masih hidup (bukan serigala).' };
        n.wolfVotes[id] = t.id; n.wolfTie = null; n.done.add(id);
        if (this.aliveWolves().length > 1) this.pushChat({ id: 'sys', name: 'Bisikan Serigala', text: `${p.name} memilih memangsa ${t.name}.`, channel: 'wolf', sys: true });
        break;
      case 'seer': {
        if (n.done.has(id)) return { ok: false, error: 'Kamu sudah menerawang malam ini.' };
        if (!validTarget || t.id === id) return { ok: false, error: 'Pilih pemain lain.' };
        const isWolf = t.role === 'werewolf';
        p.notes.push({ day: this.day, text: `Malam ${this.day}: ${t.name} ${isWolf ? 'ADALAH 🐺 Werewolf!' : 'bukan Werewolf.'}`, target: t.id, wolf: isWolf });
        n.see[id] = t.id; n.done.add(id);
        break;
      }
      case 'doctor':
        if (!validTarget) return { ok: false, error: 'Pilih pemain hidup.' };
        if (p.lastProtect === t.id) return { ok: false, error: 'Tidak boleh melindungi orang yang sama 2 malam berturut-turut.' };
        n.protect = t.id; n.done.add(id);
        break;
      case 'guardian':
        if (!validTarget || t.id === id) return { ok: false, error: 'Pilih pemain lain untuk dikawal.' };
        n.guard = t.id; n.done.add(id);
        break;
      case 'witch':
        if (a.type === 'heal') {
          if (!p.potions.heal) return { ok: false, error: 'Ramuan penyembuh sudah dipakai.' };
          if (!this.wolfTarget()) return { ok: false, error: 'Serigala belum memilih korban.' };
          n.heal = !n.heal;
        } else if (a.type === 'poison') {
          if (!p.potions.poison) return { ok: false, error: 'Ramuan racun sudah dipakai.' };
          if (!validTarget || t.id === id) return { ok: false, error: 'Pilih target racun.' };
          n.poison = n.poison === t.id ? null : t.id;
        } else if (a.type === 'done') n.done.add(id);
        break;
      default: return { ok: false };
    }
    this.checkEarly();
    this.emit();
    return { ok: true };
  }

  checkEarly() {
    if (this.phase === 'night' && this.night) {
      const actors = this.nightActors();
      const wolvesDone = this.aliveWolves().every((w) => this.night.wolfVotes[w.id]);
      const allDone = actors.every((p) => p.role === 'werewolf' ? wolvesDone : this.night.done.has(p.id));
      if (allDone && actors.length) { clearTimeout(this.timer); this.timer = setTimeout(() => this.phase === 'night' && this.resolveNight(), 1500); }
    }
    if (this.phase === 'vote' && this.votes) {
      if (this.alive.every((p) => this.votes[p.id])) { clearTimeout(this.timer); this.timer = setTimeout(() => this.phase === 'vote' && this.resolveVote(), 1500); }
    }
  }

  kill(p, cause) {
    if (!p || !p.alive) return;
    p.alive = false; p.diedDay = this.day; p.cause = cause;
    this.pendingDeaths.push(p.id);
    if (p.role === 'hunter') this.hunterQueue.push(p.id);
  }

  resolveNight() {
    const n = this.night; if (!n) return;
    this.pendingDeaths = []; this.hunterQueue = [];
    const victimId = this.wolfTarget();
    const victim = victimId && this.players.get(victimId);
    const witch = this.alive.find((p) => p.role === 'witch');
    const doctor = this.alive.find((p) => p.role === 'doctor');
    if (doctor) doctor.lastProtect = n.protect;
    let saved = false;
    if (victim) {
      if (n.protect === victim.id) saved = true;
      if (n.heal && witch && witch.potions.heal) { saved = true; witch.potions.heal = false; }
      if (!saved) {
        const guardian = this.alive.find((p) => p.role === 'guardian');
        if (guardian && n.guard === victim.id) this.kill(guardian, 'mengorbankan diri melindungi warga');
        else this.kill(victim, 'dimangsa serigala');
      }
    }
    if (n.poison && witch && witch.potions.poison) { witch.potions.poison = false; this.kill(this.players.get(n.poison), 'diracun'); }
    this.night = null;

    if (!this.pendingDeaths.length) {
      this.announce(saved ? '☀ Fajar tiba. Seseorang diserang semalam, tetapi berhasil diselamatkan!' : '☀ Fajar tiba. Malam ini tidak ada korban.', 'phase');
    } else {
      for (const id of this.pendingDeaths) {
        const d = this.players.get(id);
        this.announce(`☠ ${d.name} ditemukan tewas — ${d.cause}.${this.settings.revealRoles ? ` Ia adalah ${ROLES[d.role].icon} ${ROLES[d.role].name}.` : ''}`, 'death');
      }
    }
    this.sys(this.log[this.log.length - 1].text);
    this.setPhase('dawn', 6);
  }

  // ---------------- siang ----------------
  afterDeaths(next) {
    if (this.hunterQueue && this.hunterQueue.length && this.aliveWolves().length) {
      this.hunterId = this.hunterQueue.shift();
      this.hunterNext = next;
      const h = this.players.get(this.hunterId);
      this.announce(`🏹 ${h.name} sang Hunter menarik busur terakhirnya…`, 'phase');
      this.setPhase('hunter', 20);
      return;
    }
    if (this.checkWin()) return;
    if (next === 'day') {
      this.announce(`☀ Hari ke-${this.day}. Diskusikan siapa Werewolf-nya!`, 'phase');
      this.setPhase('day', this.settings.timers.day);
    } else {
      this.setPhase('night', this.settings.timers.night);
    }
  }

  hunterShoot(id, target, timeout = false) {
    if (this.phase !== 'hunter' || id !== this.hunterId) return { ok: false };
    const t = target && this.players.get(target);
    this.pendingDeaths = []; const queue = this.hunterQueue || []; this.hunterQueue = queue;
    if (t && t.alive && t.id !== id && t.id !== this.modId) {
      this.kill(t, 'terkena panah Hunter');
      this.announce(`🏹 Panah Hunter menembus ${t.name}!${this.settings.revealRoles ? ` Ia adalah ${ROLES[t.role].icon} ${ROLES[t.role].name}.` : ''}`, 'death');
    } else this.announce(timeout ? 'Hunter tidak sempat menembak.' : 'Hunter menurunkan busurnya.', 'info');
    this.sys(this.log[this.log.length - 1].text);
    this.afterDeaths(this.hunterNext);
    return { ok: true };
  }

  vote(id, target) {
    const p = this.players.get(id);
    if (this.phase !== 'vote' || !p || !p.alive) return { ok: false };
    if (target !== 'skip') { const t = this.players.get(target); if (!t || !t.alive || t.id === this.modId) return { ok: false }; }
    this.votes[id] = target;
    this.checkEarly();
    this.emit();
    return { ok: true };
  }
  tally() {
    const t = {};
    for (const [voter, target] of Object.entries(this.votes || {})) {
      const v = this.players.get(voter); if (!v || !v.alive) continue;
      t[target] = (t[target] || 0) + (v.role === 'judge' ? 2 : 1);
    }
    return t;
  }
  resolveVote() {
    this.pendingDeaths = []; this.hunterQueue = [];
    const t = this.tally();
    const entries = Object.entries(t).sort((a, b) => b[1] - a[1]);
    let msg;
    if (!entries.length) msg = 'Tidak ada yang memberikan suara. Tidak ada eksekusi hari ini.';
    else if (entries[1] && entries[1][1] === entries[0][1]) msg = 'Suara seri. Warga gagal sepakat — tidak ada eksekusi.';
    else if (entries[0][0] === 'skip') msg = 'Mayoritas memilih abstain. Tidak ada eksekusi.';
    else {
      const d = this.players.get(entries[0][0]);
      this.kill(d, 'dieksekusi warga');
      msg = `⚖ Warga memutuskan mengeksekusi ${d.name} (${entries[0][1]} suara).${this.settings.revealRoles ? ` Ia adalah ${ROLES[d.role].icon} ${ROLES[d.role].name}.` : ''}`;
    }
    this.lastTally = t;
    this.announce(msg, this.pendingDeaths.length ? 'death' : 'info');
    this.sys(msg);
    this.setPhase('verdict', 6);
  }

  checkWin(silentIfNone) {
    if (this.phase === 'lobby' || this.phase === 'end') return false;
    const wolves = this.aliveWolves().length, others = this.alive.length - wolves;
    let w = null;
    if (wolves === 0) w = 'village';
    else if (wolves >= others) w = 'wolf';
    if (!w) return false;
    this.winner = w;
    clearTimeout(this.timer); this.botTimers.forEach(clearTimeout);
    this.phase = 'end'; this.deadline = 0;
    const msg = w === 'village' ? '🎉 Semua Werewolf telah dieliminasi. WARGA MENANG!' : '🐺 Serigala menguasai desa. WEREWOLF MENANG!';
    this.announce(msg, 'win'); this.sys(msg);
    this.emit();
    return true;
  }

  // ---------------- chat ----------------
  channelFor(p) {
    if (!p) return null;
    if (p.id === this.modId) return 'all';
    if (this.phase === 'lobby' || this.phase === 'end' || this.phase === 'reveal') return 'all';
    if (!p.alive) return 'ghost';
    if (this.phase === 'night') return p.role === 'werewolf' ? 'wolf' : null;
    return 'all';
  }
  say(id, text) {
    const p = this.players.get(id);
    const msg = clean(text, 240);
    if (!p || !msg) return { ok: false };
    const now = Date.now();
    if (p.lastChat && now - p.lastChat < 600) return { ok: false, error: 'Terlalu cepat.' };
    p.lastChat = now;
    const channel = this.channelFor(p);
    if (!channel) return { ok: false, error: 'Kamu sedang tidur. Tidak bisa bicara di malam hari.' };
    this.pushChat({ id, name: p.name, color: p.color, text: msg, channel, mod: id === this.modId });
    this.emit();
    return { ok: true };
  }

  // ---------------- bot ----------------
  scheduleBots(kind) {
    const bots = this.alive.filter((p) => p.isBot);
    for (const b of bots) {
      const delay = 1500 + Math.random() * 5000;
      this.botTimers.push(setTimeout(() => this.botAct(b, kind), delay));
    }
  }
  botAct(b, kind) {
    if (!b.alive && kind !== 'hunter') return;
    const others = this.alive.filter((p) => p.id !== b.id);
    if (!others.length) return;
    if (kind === 'night' && this.phase === 'night') {
      if (b.role === 'werewolf') {
        // ikuti pilihan serigala lain bila ada
        const mate = Object.values(this.night.wolfVotes)[0];
        const pool = others.filter((p) => p.role !== 'werewolf');
        if (pool.length) this.act(b.id, { target: mate && Math.random() < 0.8 ? mate : pick(pool).id });
      } else if (b.role === 'seer') this.act(b.id, { target: pick(others).id });
      else if (b.role === 'doctor') { const pool = this.alive.filter((p) => p.id !== b.lastProtect); this.act(b.id, { target: pick(pool).id }); }
      else if (b.role === 'guardian') this.act(b.id, { target: pick(others).id });
      else if (b.role === 'witch') {
        if (b.potions.heal && this.wolfTarget() && Math.random() < 0.4) this.act(b.id, { type: 'heal' });
        this.act(b.id, { type: 'done' });
      }
    } else if (kind === 'vote' && this.phase === 'vote') {
      // condong ikut suara terbanyak, kadang abstain
      const t = this.tally(); const lead = Object.keys(t).sort((x, y) => t[y] - t[x])[0];
      const known = b.notes?.find((n) => n.wolf && this.players.get(n.target)?.alive);
      let target = known ? known.target : (lead && lead !== b.id && Math.random() < 0.6 ? lead : pick(others).id);
      if (b.role === 'werewolf') { const pool = others.filter((p) => p.role !== 'werewolf'); if (pool.length) target = lead && this.players.get(lead)?.role !== 'werewolf' ? lead : pick(pool).id; }
      if (Math.random() < 0.1) target = 'skip';
      this.vote(b.id, target);
    } else if (kind === 'hunter' && this.phase === 'hunter' && this.hunterId === b.id) {
      this.hunterShoot(b.id, pick(others).id);
    }
  }

  // ---------------- tampilan per pemain ----------------
  view(id) {
    const me = this.players.get(id);
    const isMod = this.isMod(id);
    const ended = this.phase === 'end';
    const meWolf = me?.role === 'werewolf';
    const players = [...this.players.values()].map((p) => {
      const showRole = p.id === id || isMod || ended || (meWolf && p.role === 'werewolf') || (!p.alive && this.settings.revealRoles && p.role) || p.id === this.modId;
      return {
        id: p.id, name: p.name, color: p.color, isBot: p.isBot, connected: p.connected, alive: p.alive,
        isHost: p.id === this.hostId, isMod: p.id === this.modId, role: showRole ? p.role : null,
      };
    });
    const v = {
      code: this.code, name: this.name, isPublic: this.isPublic, phase: this.phase, phaseName: PHASES[this.phase], day: this.day,
      deadline: this.deadline, paused: this.paused, pausedLeft: this.pausedLeft, now: Date.now(),
      hostId: this.hostId, modId: this.modId, you: id, isHost: this.isHost(id), isMod, canControl: this.canControl(id),
      settings: this.settings, planned: this.phase === 'lobby' ? this.roleSummary(this.plannedRoles()) : null,
      players, log: this.log.slice(-12), winner: this.winner,
      chat: this.chat.filter((m) => ended || isMod || m.channel === 'all' || (m.channel === 'wolf' && meWolf) || (m.channel === 'ghost' && me && !me.alive)).slice(-80),
      chatChannel: this.channelFor(me),
      me: me ? { role: me.role, alive: me.alive, notes: me.notes || [], potions: me.potions, lastProtect: me.lastProtect } : null,
    };
    // info aksi malam
    if (this.phase === 'night' && this.night && me?.alive) {
      const n = this.night;
      v.night = { done: n.done.has(id) };
      if (meWolf) { v.night.wolfVotes = n.wolfVotes; v.night.target = this.wolfTarget(); }
      if (me.role === 'doctor') v.night.choice = n.protect;
      if (me.role === 'guardian') v.night.choice = n.guard;
      if (me.role === 'seer') v.night.choice = n.see[id];
      if (me.role === 'witch') { v.night.victim = this.wolfTarget(); v.night.heal = n.heal; v.night.poison = n.poison; }
    }
    if (isMod && this.night) {
      const n = this.night;
      v.modNight = { wolfTarget: this.wolfTarget(), protect: n.protect, guard: n.guard, heal: n.heal, poison: n.poison, see: n.see, done: [...n.done], actors: this.nightActors().map((p) => p.id) };
    }
    if (this.phase === 'vote') {
      v.votes = this.votes || {}; // terbuka (voting publik)
      v.tally = this.tally();
    }
    if (this.phase === 'verdict') v.tally = this.lastTally;
    if (this.phase === 'hunter') v.hunterId = this.hunterId;
    return v;
  }

  summary() {
    return { code: this.code, name: this.name, players: this.seated.length, humans: this.humanCount, phase: this.phase, phaseName: PHASES[this.phase], day: this.day, hasMod: !!this.modId, isPublic: this.isPublic };
  }
  destroy() { clearTimeout(this.timer); this.botTimers.forEach(clearTimeout); }
}
