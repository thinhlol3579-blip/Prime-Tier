import { useState, useEffect, useMemo, useRef } from "react";
import { Flame, Plus, X, Trash2, Settings, Trophy, Pencil, Check, Sliders, Search, Ban, Download, Swords, Pin, ChevronUp, ChevronDown } from "lucide-react";
import { db } from "./firebase";
import { doc, onSnapshot, setDoc } from "firebase/firestore";

const TIER_CODES = ["HT1", "LT1", "HT2", "LT2", "HT3", "LT3", "HT4", "LT4", "HT5", "LT5"];
const TIER_GROUP = { HT1: 1, LT1: 1, HT2: 2, LT2: 2, HT3: 3, LT3: 3, HT4: 4, LT4: 4, HT5: 5, LT5: 5 };
const DEFAULT_POINTS = { HT1: 20, LT1: 18, HT2: 16, LT2: 14, HT3: 12, LT3: 10, HT4: 8, LT4: 6, HT5: 4, LT5: 2 };

const GROUP_COLOR = {
  1: { edge: "#E8432B", bg: "rgba(232,67,43,0.10)", text: "#FF8264" },
  2: { edge: "#E8813A", bg: "rgba(232,129,58,0.10)", text: "#FFA968" },
  3: { edge: "#D9B44A", bg: "rgba(217,180,74,0.10)", text: "#F0CE7C" },
  4: { edge: "#5FAFC4", bg: "rgba(95,175,196,0.10)", text: "#8FD3E4" },
  5: { edge: "#4C6FA6", bg: "rgba(76,111,166,0.10)", text: "#8AA6D6" },
  UR: { edge: "#4A4A57", bg: "rgba(74,74,87,0.10)", text: "#9694A3" },
};

const DEFAULT_MODES = [
  { id: "crystal", name: "Crystal", icon: "💎" },
  { id: "sword", name: "Sword", icon: "🗡️" },
  { id: "uhc", name: "UHC", icon: "❤️" },
  { id: "pot", name: "Pot", icon: "🧪" },
  { id: "nethpot", name: "NethPot", icon: "🔥" },
  { id: "axe", name: "Axe", icon: "🪓" },
  { id: "mace", name: "Mace", icon: "🔨" },
  { id: "smp", name: "SMP", icon: "🛡️" },
];

const ICON_CHOICES = [
  "⚔️", "🗡️", "🛡️", "🏹", "🪓", "🔨", "🔱", "🪃",
  "💎", "🧪", "🔥", "❄️", "⚡", "☠️", "💀", "🩸",
  "👑", "🎯", "⭐", "🌟", "💥", "🧨", "⛏️", "🏆",
  "🎮", "🔮", "🌀", "🦴", "🐉", "🕸️", "🧱", "🪄",
];

const MEDAL = {
  0: { edge: "#FFD54A", glow: "rgba(255,213,74,0.45)", chip: "#FFD54A" },
  1: { edge: "#D6DCE5", glow: "rgba(214,220,229,0.35)", chip: "#D6DCE5" },
  2: { edge: "#E29659", glow: "rgba(226,150,89,0.35)", chip: "#E29659" },
};

const PIN_BOARD_SIZES = {
  sm: { avatar: 26, name: 12, score: 20, padding: "8px 18px", gap: 14, labelFont: 9 },
  md: { avatar: 32, name: 14, score: 26, padding: "12px 26px", gap: 18, labelFont: 10 },
  lg: { avatar: 40, name: 17, score: 34, padding: "20px 38px", gap: 30, labelFont: 11 },
};

const DOC_REF_PATH = ["tierLadder", "data"];
const ADMIN_PASSWORD = "992010"; // đổi mật khẩu này tuỳ ý
const uid = () => Math.random().toString(36).slice(2, 10);

function tierMeta(code, points) {
  if (!code || code === "UR") return { code: "UR", group: "UR", points: 0 };
  return { code, group: TIER_GROUP[code], points: points?.[code] ?? DEFAULT_POINTS[code] };
}

function initials(name) {
  return name.trim().split(/\s+/).slice(-2).map((w) => w[0]?.toUpperCase()).join("");
}

function loadImageEl(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function matchWinner(m) {
  const { playerAId, playerBId, scoreA, scoreB } = m;
  if (playerAId && !playerBId) return playerAId;
  if (!playerAId && playerBId) return playerBId;
  if (!playerAId && !playerBId) return null;
  if (scoreA > scoreB && (scoreA > 0 || scoreB > 0)) return playerAId;
  if (scoreB > scoreA && (scoreA > 0 || scoreB > 0)) return playerBId;
  return null;
}

function recomputeBracket(rounds) {
  const newRounds = rounds.map((r) => r.map((m) => ({ ...m })));
  for (let ri = 0; ri < newRounds.length - 1; ri++) {
    const round = newRounds[ri];
    const nextRound = newRounds[ri + 1];
    for (let mi = 0; mi < round.length; mi++) {
      const winnerId = matchWinner(round[mi]);
      const parentIdx = Math.floor(mi / 2);
      const slot = mi % 2 === 0 ? "playerAId" : "playerBId";
      const parent = nextRound[parentIdx];
      if (parent[slot] !== winnerId) {
        parent[slot] = winnerId;
        parent.scoreA = 0;
        parent.scoreB = 0;
        parent.modeIds = [];
      }
    }
  }
  return newRounds;
}

function buildBracketRounds(size, slots) {
  const round0 = [];
  for (let i = 0; i < size / 2; i++) {
    round0.push({ id: uid(), playerAId: slots[i * 2] || null, playerBId: slots[i * 2 + 1] || null, scoreA: 0, scoreB: 0, modeIds: [] });
  }
  const rounds = [round0];
  let count = size / 2;
  while (count > 1) {
    count = count / 2;
    const round = [];
    for (let i = 0; i < count; i++) round.push({ id: uid(), playerAId: null, playerBId: null, scoreA: 0, scoreB: 0, modeIds: [] });
    rounds.push(round);
  }
  return recomputeBracket(rounds);
}

function Avatar({ name, photoUrl, size }) {
  const s = { width: size, height: size, borderRadius: "50%", flexShrink: 0, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.36, fontWeight: 600, background: "#221F2B" };
  if (photoUrl) return <img src={photoUrl} alt="" style={{ ...s, objectFit: "cover" }} onError={(e) => { e.target.style.display = "none"; }} />;
  return <div style={s}>{initials(name)}</div>;
}

function IconPicker({ value, onChange }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: 4, background: "#1E1E2A", border: "1px solid #2A2733", borderRadius: 8, padding: 8, maxWidth: 260 }}>
      {ICON_CHOICES.map((ic) => (
        <button
          key={ic}
          type="button"
          onClick={() => onChange(ic)}
          style={{
            fontSize: 16,
            padding: "4px 0",
            borderRadius: 6,
            border: value === ic ? "1px solid #5FAFC4" : "1px solid transparent",
            background: value === ic ? "rgba(95,175,196,0.15)" : "transparent",
            cursor: "pointer",
          }}
        >
          {ic}
        </button>
      ))}
    </div>
  );
}

function ModeIcon({ g, size = 14 }) {
  if (g?.iconUrl) {
    return <img src={g.iconUrl} alt="" style={{ width: size, height: size, objectFit: "cover", borderRadius: 4, flexShrink: 0 }} onError={(e) => { e.target.style.display = "none"; }} />;
  }
  return <span style={{ fontSize: size }}>{g?.icon || "⚔️"}</span>;
}

export default function TierLadder() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [activeTab, setActiveTab] = useState("overall");
  const [addingPlayer, setAddingPlayer] = useState(false);
  const [newPlayerName, setNewPlayerName] = useState("");
  const [newPlayerPhoto, setNewPlayerPhoto] = useState("");
  const [addingMode, setAddingMode] = useState(false);
  const [newModeName, setNewModeName] = useState("");
  const [newModeIcon, setNewModeIcon] = useState("⚔️");
  const [newModeIconUrl, setNewModeIconUrl] = useState("");
  const [editingModeId, setEditingModeId] = useState(null);
  const [editModeName, setEditModeName] = useState("");
  const [editModeIcon, setEditModeIcon] = useState("");
  const [editModeIconUrl, setEditModeIconUrl] = useState("");
  const [showEditIconPicker, setShowEditIconPicker] = useState(false);
  const [showNewIconPicker, setShowNewIconPicker] = useState(false);
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const [renamePhotoValue, setRenamePhotoValue] = useState("");
  const [showPoints, setShowPoints] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [selectedPlayerId, setSelectedPlayerId] = useState(null);
  const [search, setSearch] = useState("");
  const [addingTournament, setAddingTournament] = useState(false);
  const [newTournamentName, setNewTournamentName] = useState("");
  const [newTournamentType, setNewTournamentType] = useState("knockout");
  const [bracketSize, setBracketSize] = useState(4);
  const [bracketSlots, setBracketSlots] = useState(["", "", "", ""]);
  const [addingMatchFor, setAddingMatchFor] = useState(null);
  const [matchDraft, setMatchDraft] = useState({ teamA: [], teamB: [], modeIds: [], scoreA: 0, scoreB: 0 });

  useEffect(() => {
    const ref = doc(db, ...DOC_REF_PATH);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) {
          const parsed = snap.data();
          setData({ gamemodes: DEFAULT_MODES, players: [], tierPoints: { ...DEFAULT_POINTS }, tournaments: [], ...parsed });
        } else {
          setData({ gamemodes: DEFAULT_MODES, players: [], tierPoints: { ...DEFAULT_POINTS }, tournaments: [] });
        }
        setLoading(false);
      },
      () => {
        setData({ gamemodes: DEFAULT_MODES, players: [], tierPoints: { ...DEFAULT_POINTS }, tournaments: [] });
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  const tabsBarRef = useRef(null);

  useEffect(() => {
    const el = tabsBarRef.current;
    if (!el) return;
    const handler = (e) => {
      if (e.deltaY === 0) return;
      el.scrollLeft += e.deltaY;
      e.preventDefault();
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, [loading]);

  async function persist(next) {
    setData(next);
    try {
      const ref = doc(db, ...DOC_REF_PATH);
      await setDoc(ref, next);
      setSaveError(false);
    } catch {
      setSaveError(true);
    }
  }

  const players = data?.players ?? [];
  const gamemodes = data?.gamemodes ?? [];
  const tierPoints = data?.tierPoints ?? DEFAULT_POINTS;
  const tournaments = data?.tournaments ?? [];

  function addPlayer() {
    const name = newPlayerName.trim();
    if (!name) return;
    const p = { id: uid(), name, ranks: {}, photoUrl: newPlayerPhoto.trim() || null };
    persist({ ...data, players: [...players, p] });
    setNewPlayerName("");
    setNewPlayerPhoto("");
    setAddingPlayer(false);
  }

  function removePlayer(id) {
    persist({ ...data, players: players.filter((p) => p.id !== id) });
  }

  function saveEdit(id) {
    const name = renameValue.trim();
    if (!name) return setRenamingId(null);
    persist({
      ...data,
      players: players.map((p) => (p.id === id ? { ...p, name, photoUrl: renamePhotoValue.trim() || null } : p)),
    });
    setRenamingId(null);
  }

  function setRank(playerId, modeId, code) {
    persist({
      ...data,
      players: players.map((p) => {
        if (p.id !== playerId) return p;
        const ranks = { ...p.ranks };
        if (code === "UR") {
          delete ranks[modeId];
        } else {
          ranks[modeId] = code;
        }
        return { ...p, ranks };
      }),
    });
  }

  function toggleRetired(playerId, modeId) {
    persist({
      ...data,
      players: players.map((p) => {
        if (p.id !== playerId) return p;
        const retired = { ...(p.retired || {}) };
        if (retired[modeId]) delete retired[modeId];
        else retired[modeId] = true;
        return { ...p, retired };
      }),
    });
  }

  function addMode() {
    const name = newModeName.trim();
    if (!name) return;
    const id = uid();
    persist({ ...data, gamemodes: [...gamemodes, { id, name, icon: newModeIcon.trim() || "⚔️", iconUrl: newModeIconUrl.trim() || null }] });
    setNewModeName("");
    setNewModeIcon("⚔️");
    setNewModeIconUrl("");
    setAddingMode(false);
    setActiveTab(id);
  }

  function removeMode(id) {
    if (!confirm("Xoá chế độ chơi này? Toàn bộ hạng đã xếp cho chế độ này sẽ mất.")) return;
    persist({
      ...data,
      gamemodes: gamemodes.filter((g) => g.id !== id),
      players: players.map((p) => {
        const ranks = { ...p.ranks };
        delete ranks[id];
        return { ...p, ranks };
      }),
    });
    if (activeTab === id) setActiveTab("overall");
  }

  function saveModeEdit(id) {
    const name = editModeName.trim();
    if (!name) return setEditingModeId(null);
    persist({ ...data, gamemodes: gamemodes.map((g) => (g.id === id ? { ...g, name, icon: editModeIcon.trim() || "⚔️", iconUrl: editModeIconUrl.trim() || null } : g)) });
    setEditingModeId(null);
  }

  function setTierPoint(code, value) {
    const n = Math.max(0, Math.min(999, Number(value) || 0));
    persist({ ...data, tierPoints: { ...tierPoints, [code]: n } });
  }

  function addTournament() {
    const name = newTournamentName.trim();
    if (!name) return;
    let t;
    if (newTournamentType === "knockout") {
      const filled = bracketSlots.filter(Boolean).length;
      if (filled < 2) {
        alert("Chọn ít nhất 2 người chơi cho bảng đấu.");
        return;
      }
      t = { id: uid(), name, type: "knockout", rounds: buildBracketRounds(bracketSize, bracketSlots) };
    } else {
      t = { id: uid(), name, type: "freeform", matches: [] };
    }
    persist({ ...data, tournaments: [t, ...tournaments] });
    setNewTournamentName("");
    setAddingTournament(false);
    setBracketSlots(Array(bracketSize).fill(""));
  }

  function deleteTournament(id) {
    if (!confirm("Xoá giải đấu này? Toàn bộ trận đấu trong đó sẽ mất.")) return;
    persist({ ...data, tournaments: tournaments.filter((t) => t.id !== id) });
  }

  function addMatch(tournamentId) {
    const { teamA, teamB, modeIds, scoreA, scoreB } = matchDraft;
    if (teamA.length === 0 || teamB.length === 0) {
      alert("Chọn ít nhất 1 người cho mỗi đội.");
      return;
    }
    const match = { id: uid(), teamA, teamB, modeIds: modeIds || [], scoreA: Number(scoreA) || 0, scoreB: Number(scoreB) || 0 };
    persist({
      ...data,
      tournaments: tournaments.map((t) => (t.id === tournamentId ? { ...t, matches: [...t.matches, match] } : t)),
    });
    setMatchDraft({ teamA: [], teamB: [], modeIds: [], scoreA: 0, scoreB: 0 });
    setAddingMatchFor(null);
  }

  function toggleDraftPlayer(team, playerId) {
    setMatchDraft((d) => {
      const otherKey = team === "A" ? "teamB" : "teamA";
      const mineKey = team === "A" ? "teamA" : "teamB";
      if (d[otherKey].includes(playerId)) return d;
      const set = new Set(d[mineKey]);
      if (set.has(playerId)) set.delete(playerId);
      else set.add(playerId);
      return { ...d, [mineKey]: Array.from(set) };
    });
  }

  function toggleDraftMode(modeId) {
    setMatchDraft((d) => {
      const set = new Set(d.modeIds);
      if (set.has(modeId)) set.delete(modeId);
      else set.add(modeId);
      return { ...d, modeIds: Array.from(set) };
    });
  }

  function deleteMatch(tournamentId, matchId) {
    persist({
      ...data,
      tournaments: tournaments.map((t) => (t.id === tournamentId ? { ...t, matches: t.matches.filter((m) => m.id !== matchId) } : t)),
    });
  }

  function updateMatchScore(tournamentId, matchId, field, value) {
    const n = Math.max(0, Number(value) || 0);
    persist({
      ...data,
      tournaments: tournaments.map((t) =>
        t.id !== tournamentId ? t : { ...t, matches: t.matches.map((m) => (m.id === matchId ? { ...m, [field]: n } : m)) }
      ),
    });
  }

  function updateMatchModes(tournamentId, matchId, modeId) {
    persist({
      ...data,
      tournaments: tournaments.map((t) =>
        t.id !== tournamentId
          ? t
          : {
              ...t,
              matches: t.matches.map((m) => {
                if (m.id !== matchId) return m;
                const ids = new Set(m.modeIds || (m.modeId ? [m.modeId] : []));
                if (ids.has(modeId)) ids.delete(modeId);
                else ids.add(modeId);
                return { ...m, modeIds: Array.from(ids) };
              }),
            }
      ),
    });
  }

  function updateBracketMatch(tournamentId, roundIdx, matchIdx, field, value) {
    const t = tournaments.find((x) => x.id === tournamentId);
    if (!t) return;
    const rounds = t.rounds.map((r) => r.map((m) => ({ ...m })));
    const match = rounds[roundIdx][matchIdx];
    if (field === "scoreA" || field === "scoreB") {
      match[field] = Math.max(0, Number(value) || 0);
    } else if (field === "toggleMode") {
      const ids = new Set(match.modeIds || (match.modeId ? [match.modeId] : []));
      if (ids.has(value)) ids.delete(value);
      else ids.add(value);
      match.modeIds = Array.from(ids);
    }
    const newRounds = recomputeBracket(rounds);
    persist({ ...data, tournaments: tournaments.map((x) => (x.id === tournamentId ? { ...x, rounds: newRounds } : x)) });
  }

  function togglePin(ref) {
    const current = data?.pinnedMatch;
    const same = current && current.tournamentId === ref.tournamentId && current.matchId === ref.matchId && current.roundIdx === ref.roundIdx;
    persist({ ...data, pinnedMatch: same ? null : ref });
  }

  function setPinnedBoardSize(size) {
    persist({ ...data, pinnedBoardSize: size });
  }

  function adjustPinnedOffset(delta) {
    const current = data?.pinnedBoardOffset || 0;
    const next = Math.max(-150, Math.min(60, current + delta));
    persist({ ...data, pinnedBoardOffset: next });
  }

  async function exportCard(player) {
    const width = 640;
    const rowH = 54;
    const headerH = 450;
    const footerH = 70;
    const height = headerH + gamemodes.length * rowH + footerH;

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");

    const grad = ctx.createLinearGradient(0, 0, 0, height);
    grad.addColorStop(0, "#181521");
    grad.addColorStop(1, "#0A090E");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 2;
    ctx.strokeRect(8, 8, width - 16, height - 16);

    ctx.textAlign = "center";
    ctx.fillStyle = "#E8432B";
    ctx.font = "bold 20px sans-serif";
    ctx.fillText("🔥 PRIME TIER", width / 2, 55);

    const avatarSize = 170;
    const avatarX = width / 2;
    const avatarY = 190;
    ctx.save();
    ctx.beginPath();
    ctx.arc(avatarX, avatarY, avatarSize / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    let drawn = false;
    if (player.photoUrl) {
      try {
        const img = await loadImageEl(player.photoUrl);
        ctx.drawImage(img, avatarX - avatarSize / 2, avatarY - avatarSize / 2, avatarSize, avatarSize);
        drawn = true;
      } catch {
        drawn = false;
      }
    }
    if (!drawn) {
      ctx.fillStyle = "#221F2B";
      ctx.fillRect(avatarX - avatarSize / 2, avatarY - avatarSize / 2, avatarSize, avatarSize);
      ctx.fillStyle = "#F1EFF7";
      ctx.font = "bold 62px sans-serif";
      ctx.textBaseline = "middle";
      ctx.fillText(initials(player.name), avatarX, avatarY + 4);
      ctx.textBaseline = "alphabetic";
    }
    ctx.restore();
    ctx.beginPath();
    ctx.arc(avatarX, avatarY, avatarSize / 2, 0, Math.PI * 2);
    ctx.strokeStyle = "#5FAFC4";
    ctx.lineWidth = 4;
    ctx.stroke();

    ctx.fillStyle = "#F1EFF7";
    ctx.font = "bold 32px sans-serif";
    ctx.fillText(player.name, width / 2, avatarY + avatarSize / 2 + 48);

    ctx.fillStyle = "#8D8998";
    ctx.font = "14px monospace";
    ctx.fillText("TỔNG ĐIỂM", width / 2, avatarY + avatarSize / 2 + 78);
    ctx.fillStyle = "#FFD54A";
    ctx.font = "bold 44px monospace";
    ctx.fillText(String(totals[player.id] ?? 0), width / 2, avatarY + avatarSize / 2 + 128);

    let y = headerH - 20;
    ctx.textAlign = "left";
    for (const g of gamemodes) {
      const meta = tierMeta(player.ranks[g.id], tierPoints);
      const isRetired = !!player.retired?.[g.id];
      const c = GROUP_COLOR[meta.group];
      ctx.fillStyle = "rgba(255,255,255,0.04)";
      roundRect(ctx, 40, y, width - 80, rowH - 12, 10);
      ctx.fill();
      const midY = y + (rowH - 12) / 2;
      ctx.font = "20px sans-serif";
      ctx.fillStyle = "#fff";
      ctx.textBaseline = "middle";
      ctx.fillText(g.icon || "⚔️", 58, midY);
      ctx.font = "15px sans-serif";
      ctx.fillStyle = "#F1EFF7";
      ctx.fillText(g.name, 92, midY);
      const chipText = isRetired ? "NGHỈ HƯU" : meta.code === "UR" ? "CHƯA XẾP" : meta.code;
      ctx.font = "bold 13px monospace";
      ctx.fillStyle = isRetired ? "#57546A" : c.text;
      ctx.textAlign = "right";
      ctx.fillText(chipText, width - 58, midY);
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      y += rowH;
    }

    ctx.textAlign = "center";
    ctx.fillStyle = "#57546A";
    ctx.font = "12px sans-serif";
    ctx.fillText("prime-tier.vercel.app", width / 2, height - 24);

    const url = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = `${player.name.replace(/\s+/g, "_")}-tier-card.png`;
    a.click();
  }

  const totals = useMemo(() => {
    const map = {};
    for (const p of players) {
      let sum = 0;
      for (const g of gamemodes) sum += tierMeta(p.ranks[g.id], tierPoints).points;
      map[p.id] = sum;
    }
    return map;
  }, [players, gamemodes, tierPoints]);

  const overallSorted = useMemo(
    () => [...players].sort((a, b) => totals[b.id] - totals[a.id] || a.name.localeCompare(b.name)),
    [players, totals]
  );

  const rankMap = useMemo(() => {
    const m = {};
    overallSorted.forEach((p, i) => (m[p.id] = i));
    return m;
  }, [overallSorted]);

  const query = search.trim().toLowerCase();
  const filteredOverall = useMemo(
    () => (query ? overallSorted.filter((p) => p.name.toLowerCase().includes(query)) : overallSorted),
    [overallSorted, query]
  );

  const activeMode = gamemodes.find((g) => g.id === activeTab);

  const groupedForMode = useMemo(() => {
    if (!activeMode) return [];
    const groups = { 1: [], 2: [], 3: [], 4: [], 5: [], UR: [], RET: [] };
    for (const p of players) {
      if (query && !p.name.toLowerCase().includes(query)) continue;
      const meta = tierMeta(p.ranks[activeMode.id], tierPoints);
      const isRetired = !!p.retired?.[activeMode.id];
      groups[isRetired ? "RET" : meta.group].push({ player: p, meta, isRetired });
    }
    for (const k of Object.keys(groups)) groups[k].sort((a, b) => a.player.name.localeCompare(b.player.name));
    return groups;
  }, [players, activeMode, tierPoints, query]);

  const pinnedInfo = useMemo(() => {
    const ref = data?.pinnedMatch;
    if (!ref) return null;
    const t = tournaments.find((x) => x.id === ref.tournamentId);
    if (!t) return null;
    const m = ref.roundIdx !== undefined && ref.roundIdx !== null ? t.rounds?.[ref.roundIdx]?.find((x) => x.id === ref.matchId) : t.matches?.find((x) => x.id === ref.matchId);
    if (!m) return null;
    const teamAIds = m.teamA || (m.playerAId ? [m.playerAId] : []);
    const teamBIds = m.teamB || (m.playerBId ? [m.playerBId] : []);
    const teamA = teamAIds.map((id) => players.find((p) => p.id === id)).filter(Boolean);
    const teamB = teamBIds.map((id) => players.find((p) => p.id === id)).filter(Boolean);
    const modeIds = m.modeIds || (m.modeId ? [m.modeId] : []);
    const modes = modeIds.map((id) => gamemodes.find((g) => g.id === id)).filter(Boolean);
    return { tournamentName: t.name, teamA, teamB, scoreA: m.scoreA, scoreB: m.scoreB, modes };
  }, [data, tournaments, players, gamemodes]);

  if (loading) {
    return (
      <div style={{ minHeight: 300, display: "flex", alignItems: "center", justifyContent: "center", background: "#0D0C12", color: "#8D8998", fontFamily: "Inter, sans-serif" }}>
        Đang tải bảng xếp hạng…
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#0D0C12", color: "#F1EFF7", fontFamily: "'Inter', system-ui, sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@500;600&display=swap');
        .tl-display { font-family: 'Chakra Petch', sans-serif; }
        .tl-mono { font-family: 'JetBrains Mono', monospace; }
        .tl-select { background:#1E1E2A; color:#F1EFF7; border:1px solid #2A2733; border-radius:6px; padding:4px 6px; font-size:12px; font-family:'JetBrains Mono',monospace; }
        .tl-input { background:#1E1E2A; color:#F1EFF7; border:1px solid #2A2733; border-radius:6px; padding:8px 10px; font-size:14px; font-family:'Inter',sans-serif; outline:none; }
        .tl-input:focus { border-color:#5FAFC4; }
        .tl-btn { display:inline-flex; align-items:center; gap:6px; background:#1E1E2A; color:#F1EFF7; border:1px solid #2A2733; border-radius:8px; padding:8px 14px; font-size:13px; font-family:'Inter',sans-serif; cursor:pointer; transition:background 0.15s, border-color 0.15s; }
        .tl-btn:hover { background:#26242F; border-color:#3A3745; }
        .tl-tab { font-family:'Chakra Petch',sans-serif; font-weight:600; font-size:13px; letter-spacing:0.03em; padding:8px 16px; border-radius:8px; cursor:pointer; white-space:nowrap; border:1px solid transparent; }
        .tl-card { background:#17151F; border:1px solid #221F2B; border-radius:10px; padding:10px 12px; display:flex; align-items:center; gap:10px; }
        .tl-point-input { width:52px; background:#1E1E2A; color:#F1EFF7; border:1px solid #2A2733; border-radius:6px; padding:4px 6px; font-size:12px; font-family:'JetBrains Mono',monospace; text-align:center; }
        ::-webkit-scrollbar { height:6px; }
      `}</style>

      <div style={{ borderBottom: "1px solid #1E1C27", padding: "22px 28px 0" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: pinnedInfo ? 2 : 18, gap: 10, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Flame size={22} color="#E8432B" />
            <div>
              <div className="tl-display" style={{ fontSize: 20, fontWeight: 700, letterSpacing: "0.02em" }}>PRIME TIER</div>
              <div style={{ fontSize: 12, color: "#8D8998" }}>Bảng xếp hạng combat của team</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {editMode && (
              <button className="tl-btn" onClick={() => setShowPoints((s) => !s)} style={showPoints ? { background: "#26242F", borderColor: "#3A3745" } : {}}>
                <Sliders size={14} /> Điểm mỗi tier
              </button>
            )}
            <button
              className="tl-btn"
              onClick={() => {
                if (editMode) {
                  setEditMode(false);
                  return;
                }
                const input = window.prompt("Nhập mật khẩu Admin:");
                if (input === null) return;
                if (input === ADMIN_PASSWORD) {
                  setEditMode(true);
                } else {
                  alert("Sai mật khẩu.");
                }
              }}
              style={editMode ? { background: "#5FAFC4", color: "#0D0C12", borderColor: "#5FAFC4" } : {}}
            >
              <Settings size={14} /> {editMode ? "Đang chỉnh sửa" : "Chế độ Admin"}
            </button>
          </div>
        </div>

        {pinnedInfo && (() => {
          const sz = PIN_BOARD_SIZES[data?.pinnedBoardSize || "md"];
          const offset = data?.pinnedBoardOffset || 0;
          return (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, marginTop: offset, marginBottom: 14 }}>
            {editMode && (
              <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                {["sm", "md", "lg"].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setPinnedBoardSize(s)}
                    className="tl-mono"
                    style={{
                      fontSize: 10,
                      padding: "2px 8px",
                      borderRadius: 5,
                      cursor: "pointer",
                      border: (data?.pinnedBoardSize || "md") === s ? "1px solid #5FAFC4" : "1px solid #2A2733",
                      background: (data?.pinnedBoardSize || "md") === s ? "rgba(95,175,196,0.15)" : "#1E1E2A",
                      color: "#F1EFF7",
                    }}
                  >
                    {s.toUpperCase()}
                  </button>
                ))}
                <div style={{ display: "flex", gap: 2, marginLeft: 6, border: "1px solid #2A2733", borderRadius: 5, overflow: "hidden" }}>
                  <button type="button" onClick={() => adjustPinnedOffset(-10)} style={{ background: "#1E1E2A", border: "none", padding: "2px 6px", cursor: "pointer" }} title="Đẩy lên">
                    <ChevronUp size={12} color="#F1EFF7" />
                  </button>
                  <button type="button" onClick={() => adjustPinnedOffset(10)} style={{ background: "#1E1E2A", border: "none", padding: "2px 6px", cursor: "pointer" }} title="Đẩy xuống">
                    <ChevronDown size={12} color="#F1EFF7" />
                  </button>
                </div>
              </div>
            )}
            <div
              style={{
                background: "linear-gradient(135deg, rgba(232,67,43,0.14), rgba(95,175,196,0.10))",
                border: "1px solid #2A2733",
                borderRadius: 16,
                padding: sz.padding,
                display: "flex",
                alignItems: "center",
                gap: sz.gap,
                maxWidth: "100%",
                position: "relative",
                boxShadow: "0 0 30px rgba(232,67,43,0.08)",
              }}
            >
              <div style={{ position: "absolute", top: -11, left: "50%", transform: "translateX(-50%)", background: "#131119", border: "1px solid #2A2733", borderRadius: 20, padding: "4px 8px", display: "flex", alignItems: "center" }}>
                <Pin size={12} style={{ color: "#E8432B" }} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
                {pinnedInfo.teamA.map((p) => (
                  <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: sz.name, fontWeight: 700, color: pinnedInfo.scoreA > pinnedInfo.scoreB ? "#FFD54A" : "#F1EFF7" }}>{p.name}</span>
                    <Avatar name={p.name} photoUrl={p.photoUrl} size={sz.avatar} />
                  </div>
                ))}
              </div>
              <div style={{ textAlign: "center", minWidth: 90 }}>
                {pinnedInfo.tournamentName && <div className="tl-mono" style={{ fontSize: sz.labelFont, color: "#8D8998", marginBottom: 4 }}>{pinnedInfo.tournamentName.toUpperCase()}</div>}
                <div className="tl-mono" style={{ fontSize: sz.score, fontWeight: 700 }}>{pinnedInfo.scoreA} : {pinnedInfo.scoreB}</div>
                {pinnedInfo.modes && pinnedInfo.modes.length > 0 && (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                    {pinnedInfo.modes.map((mode) => (
                      <div key={mode.id} style={{ display: "flex", alignItems: "center", gap: 4 }} title={mode.name}>
                        <ModeIcon g={mode} size={15} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 8 }}>
                {pinnedInfo.teamB.map((p) => (
                  <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <Avatar name={p.name} photoUrl={p.photoUrl} size={sz.avatar} />
                    <span style={{ fontSize: sz.name, fontWeight: 700, color: pinnedInfo.scoreB > pinnedInfo.scoreA ? "#FFD54A" : "#F1EFF7" }}>{p.name}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          );
        })()}

        {editMode && showPoints && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, background: "#17151F", border: "1px solid #221F2B", borderRadius: 10, padding: 12, marginBottom: 16 }}>
            {TIER_CODES.map((code) => (
              <div key={code} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                <span className="tl-mono" style={{ fontSize: 10, color: GROUP_COLOR[TIER_GROUP[code]].text }}>{code}</span>
                <input
                  className="tl-point-input"
                  type="number"
                  value={tierPoints[code] ?? DEFAULT_POINTS[code]}
                  onChange={(e) => setTierPoint(code, e.target.value)}
                />
              </div>
            ))}
          </div>
        )}

        <div
          ref={tabsBarRef}
          style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 12 }}
        >
          <div
            className="tl-tab"
            onClick={() => setActiveTab("overall")}
            style={{ display: "flex", alignItems: "center", gap: 6, background: activeTab === "overall" ? "#1E1E2A" : "transparent", borderColor: activeTab === "overall" ? "#2A2733" : "transparent", color: activeTab === "overall" ? "#F1EFF7" : "#8D8998" }}
          >
            <Trophy size={13} /> TỔNG
          </div>
          <div
            className="tl-tab"
            onClick={() => setActiveTab("tournament")}
            style={{ display: "flex", alignItems: "center", gap: 6, background: activeTab === "tournament" ? "#1E1E2A" : "transparent", borderColor: activeTab === "tournament" ? "#2A2733" : "transparent", color: activeTab === "tournament" ? "#F1EFF7" : "#8D8998" }}
          >
            <Swords size={13} /> GIẢI ĐẤU
          </div>
          {gamemodes.map((g) =>
            editingModeId === g.id ? (
              <div key={g.id} style={{ position: "relative", display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
                {editModeIconUrl ? (
                  <img src={editModeIconUrl} alt="" style={{ width: 34, height: 34, borderRadius: 6, objectFit: "cover", flexShrink: 0 }} onError={(e) => { e.target.style.display = "none"; }} />
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowEditIconPicker((s) => !s)}
                    style={{ width: 36, height: 34, fontSize: 16, background: "#1E1E2A", border: "1px solid #2A2733", borderRadius: 6, cursor: "pointer" }}
                  >
                    {editModeIcon}
                  </button>
                )}
                {showEditIconPicker && !editModeIconUrl && (
                  <div style={{ position: "absolute", top: 38, left: 0, zIndex: 20 }}>
                    <IconPicker value={editModeIcon} onChange={(ic) => { setEditModeIcon(ic); setShowEditIconPicker(false); }} />
                  </div>
                )}
                <input
                  className="tl-input"
                  autoFocus
                  placeholder="Tên chế độ"
                  value={editModeName}
                  onChange={(e) => setEditModeName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && saveModeEdit(g.id)}
                  style={{ padding: "6px 8px", fontSize: 12, width: 120 }}
                />
                <input
                  className="tl-input"
                  placeholder="Hoặc dán link ảnh icon"
                  value={editModeIconUrl}
                  onChange={(e) => setEditModeIconUrl(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && saveModeEdit(g.id)}
                  style={{ padding: "6px 8px", fontSize: 12, width: 160 }}
                />
                <Check size={16} onClick={() => saveModeEdit(g.id)} style={{ cursor: "pointer", color: "#5FAFC4" }} />
                <X size={16} onClick={() => { setEditingModeId(null); setShowEditIconPicker(false); }} style={{ cursor: "pointer", color: "#8D8998" }} />
              </div>
            ) : (
              <div
                key={g.id}
                className="tl-tab"
                onClick={() => setActiveTab(g.id)}
                style={{ background: activeTab === g.id ? "#1E1E2A" : "transparent", borderColor: activeTab === g.id ? "#2A2733" : "transparent", color: activeTab === g.id ? "#F1EFF7" : "#8D8998", display: "flex", alignItems: "center", gap: 8 }}
              >
                <ModeIcon g={g} size={16} />
                {g.name.toUpperCase()}
                {editMode && (
                  <>
                    <Pencil
                      size={12}
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingModeId(g.id);
                        setEditModeName(g.name);
                        setEditModeIcon(g.icon || "⚔️");
                        setEditModeIconUrl(g.iconUrl || "");
                      }}
                      style={{ opacity: 0.6 }}
                    />
                    <X size={12} onClick={(e) => { e.stopPropagation(); removeMode(g.id); }} style={{ opacity: 0.6 }} />
                  </>
                )}
              </div>
            )
          )}
          {editMode &&
            (addingMode ? (
              <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
                {newModeIconUrl ? (
                  <img src={newModeIconUrl} alt="" style={{ width: 34, height: 34, borderRadius: 6, objectFit: "cover", flexShrink: 0 }} onError={(e) => { e.target.style.display = "none"; }} />
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowNewIconPicker((s) => !s)}
                    style={{ width: 36, height: 34, fontSize: 16, background: "#1E1E2A", border: "1px solid #2A2733", borderRadius: 6, cursor: "pointer" }}
                  >
                    {newModeIcon}
                  </button>
                )}
                {showNewIconPicker && !newModeIconUrl && (
                  <div style={{ position: "absolute", top: 38, left: 0, zIndex: 20 }}>
                    <IconPicker value={newModeIcon} onChange={(ic) => { setNewModeIcon(ic); setShowNewIconPicker(false); }} />
                  </div>
                )}
                <input
                  className="tl-input"
                  autoFocus
                  placeholder="Tên chế độ"
                  value={newModeName}
                  onChange={(e) => setNewModeName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addMode()}
                  style={{ padding: "6px 8px", fontSize: 12, width: 120 }}
                />
                <input
                  className="tl-input"
                  placeholder="Hoặc dán link ảnh icon"
                  value={newModeIconUrl}
                  onChange={(e) => setNewModeIconUrl(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addMode()}
                  style={{ padding: "6px 8px", fontSize: 12, width: 160 }}
                />
                <Check size={16} onClick={addMode} style={{ cursor: "pointer", color: "#5FAFC4" }} />
                <X size={16} onClick={() => { setAddingMode(false); setShowNewIconPicker(false); setNewModeIconUrl(""); }} style={{ cursor: "pointer", color: "#8D8998" }} />
              </div>
            ) : (
              <div className="tl-tab" onClick={() => setAddingMode(true)} style={{ color: "#8D8998", display: "flex", alignItems: "center", gap: 4 }}>
                <Plus size={13} /> Chế độ
              </div>
            ))}
        </div>
      </div>

      <div style={{ padding: "22px 28px 40px", maxWidth: 900, margin: "0 auto" }}>
        {players.length === 0 && !editMode && (
          <div style={{ textAlign: "center", color: "#8D8998", padding: "60px 0", fontSize: 14 }}>
            Chưa có thành viên nào. Bật Chế độ Admin để thêm.
          </div>
        )}

        {players.length > 0 && (
          <div style={{ position: "relative", marginBottom: 18 }}>
            <Search size={14} color="#8D8998" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} />
            <input
              className="tl-input"
              placeholder="Tìm thành viên theo tên..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ width: "100%", paddingLeft: 34 }}
            />
          </div>
        )}

        {activeTab === "overall" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
            {overallSorted.length > 0 && !query && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, alignItems: "end", padding: "6px 2px 0" }}>
                {[1, 0, 2].map((idx) => {
                  const p = overallSorted[idx];
                  const medal = MEDAL[idx];
                  if (!p) return <div key={idx} />;
                  const isFirst = idx === 0;
                  return (
                    <div
                      key={p.id}
                      onClick={() => setSelectedPlayerId(p.id)}
                      className="tl-display"
                      style={{
                        cursor: "pointer",
                        background: "#17151F",
                        border: `1px solid ${medal.edge}`,
                        boxShadow: `0 0 26px ${medal.glow}`,
                        borderRadius: 14,
                        padding: isFirst ? "18px 10px 14px" : "14px 8px 12px",
                        marginTop: isFirst ? 0 : 22,
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      <div style={{ fontSize: isFirst ? 14 : 12, fontWeight: 700, color: medal.chip, textShadow: `0 0 10px ${medal.glow}`, textAlign: "center", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {p.name}
                      </div>
                      <Avatar name={p.name} photoUrl={p.photoUrl} size={isFirst ? 64 : 50} />
                      <div className="tl-mono" style={{ fontSize: 11, color: "#8D8998" }}>{totals[p.id]} điểm</div>
                      <div style={{ fontSize: isFirst ? 26 : 20, fontWeight: 700, color: medal.chip, textShadow: `0 0 14px ${medal.glow}` }}>
                        {idx + 1}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {query && filteredOverall.length === 0 && (
              <div style={{ textAlign: "center", color: "#8D8998", padding: "24px 0", fontSize: 13 }}>Không tìm thấy thành viên nào.</div>
            )}
            {filteredOverall.map((p) => {
              const i = rankMap[p.id];
              const medal = MEDAL[i];
              return (
              <div
                key={p.id}
                className="tl-card"
                onClick={() => renamingId !== p.id && setSelectedPlayerId(p.id)}
                style={{
                  cursor: renamingId === p.id ? "default" : "pointer",
                  ...(medal
                    ? { border: `1px solid ${medal.edge}`, boxShadow: `0 0 18px ${medal.glow}`, background: "#1A1720" }
                    : {}),
                }}
              >
                <div className="tl-mono" style={{ width: 24, textAlign: "right", fontSize: medal ? 17 : 13, color: medal ? medal.chip : "#8D8998" }}>
                  {medal ? ["🥇", "🥈", "🥉"][i] : i + 1}
                </div>
                <Avatar name={p.name} photoUrl={p.photoUrl} size={34} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  {renamingId === p.id ? (
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }} onClick={(e) => e.stopPropagation()}>
                      {renamePhotoValue && <Avatar name={renameValue || "?"} photoUrl={renamePhotoValue} size={26} />}
                      <input className="tl-input" autoFocus placeholder="Tên" value={renameValue} onChange={(e) => setRenameValue(e.target.value)} style={{ padding: "4px 8px", fontSize: 13, width: 120 }} />
                      <input className="tl-input" placeholder="Dán link ảnh (không bắt buộc)" value={renamePhotoValue} onChange={(e) => setRenamePhotoValue(e.target.value)} style={{ padding: "4px 8px", fontSize: 13, width: 190 }} />
                      <Check size={16} onClick={() => saveEdit(p.id)} style={{ cursor: "pointer", color: "#5FAFC4", alignSelf: "center" }} />
                      <X size={16} onClick={() => setRenamingId(null)} style={{ cursor: "pointer", color: "#8D8998", alignSelf: "center" }} />
                    </div>
                  ) : (
                    <div style={{ fontSize: 14, fontWeight: medal ? 700 : 500, color: medal ? medal.chip : "#F1EFF7", textShadow: medal ? `0 0 10px ${medal.glow}` : "none" }}>{p.name}</div>
                  )}
                  <div style={{ display: "flex", gap: 4, marginTop: 4, flexWrap: "wrap" }}>
                    {gamemodes.map((g) => {
                      const meta = tierMeta(p.ranks[g.id], tierPoints);
                      const isRetired = !!p.retired?.[g.id];
                      const c = GROUP_COLOR[meta.group];
                      return (
                        <span
                          key={g.id}
                          title={isRetired ? `${g.name}: Đã nghỉ hưu` : `${g.name}: ${meta.code === "UR" ? "Chưa xếp" : meta.code}`}
                          className="tl-mono"
                          style={{ fontSize: 11, padding: "1px 6px", borderRadius: 4, background: c.bg, color: c.text, display: "inline-flex", alignItems: "center", gap: 3, opacity: isRetired ? 0.35 : meta.code === "UR" ? 0.4 : 1 }}
                        >
                          <ModeIcon g={g} size={13} />
                          {meta.code === "UR" ? "—" : meta.code}
                        </span>
                      );
                    })}
                  </div>
                </div>
                <div className="tl-mono" style={{ fontSize: 16, fontWeight: 600, minWidth: 40, textAlign: "right", color: medal ? medal.chip : "#F1EFF7" }}>{totals[p.id]}</div>
                {editMode && (
                  <div style={{ display: "flex", gap: 6, marginLeft: 6 }} onClick={(e) => e.stopPropagation()}>
                    <Pencil size={14} style={{ cursor: "pointer", color: "#8D8998" }} onClick={() => { setRenamingId(p.id); setRenameValue(p.name); setRenamePhotoValue(p.photoUrl || ""); }} />
                    <Trash2 size={14} style={{ cursor: "pointer", color: "#8D8998" }} onClick={() => removePlayer(p.id)} />
                  </div>
                )}
              </div>
              );
            })}
            </div>

            {editMode && (
              <div>
                {addingPlayer ? (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                    {newPlayerPhoto && <Avatar name={newPlayerName || "?"} photoUrl={newPlayerPhoto} size={30} />}
                    <input className="tl-input" autoFocus placeholder="Tên thành viên" value={newPlayerName} onChange={(e) => setNewPlayerName(e.target.value)} style={{ flex: "1 1 160px" }} />
                    <input className="tl-input" placeholder="Dán link ảnh (không bắt buộc)" value={newPlayerPhoto} onChange={(e) => setNewPlayerPhoto(e.target.value)} style={{ flex: "1 1 200px" }} onKeyDown={(e) => e.key === "Enter" && addPlayer()} />
                    <button className="tl-btn" onClick={addPlayer}><Check size={14} /> Thêm</button>
                    <button className="tl-btn" onClick={() => setAddingPlayer(false)}><X size={14} /></button>
                  </div>
                ) : (
                  <button className="tl-btn" onClick={() => setAddingPlayer(true)}><Plus size={14} /> Thêm thành viên</button>
                )}
              </div>
            )}

            {saveError && <div style={{ fontSize: 12, color: "#E8432B" }}>Lưu dữ liệu thất bại — thử lại thao tác vừa rồi.</div>}
          </div>
        ) : activeTab === "tournament" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {tournaments.length === 0 && !editMode && (
              <div style={{ textAlign: "center", color: "#8D8998", padding: "60px 0", fontSize: 14 }}>Chưa có giải đấu nào.</div>
            )}

            {editMode && (
              addingTournament ? (
                <div style={{ background: "#17151F", border: "1px solid #221F2B", borderRadius: 12, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
                  <input className="tl-input" autoFocus placeholder="Tên giải đấu" value={newTournamentName} onChange={(e) => setNewTournamentName(e.target.value)} />
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <select className="tl-select" value={newTournamentType} onChange={(e) => setNewTournamentType(e.target.value)}>
                      <option value="knockout">Vòng loại trực tiếp (Knockout)</option>
                      <option value="freeform">Danh sách trận tự do</option>
                    </select>
                    {newTournamentType === "knockout" && (
                      <select
                        className="tl-select"
                        value={bracketSize}
                        onChange={(e) => {
                          const size = Number(e.target.value);
                          setBracketSize(size);
                          setBracketSlots((prev) => {
                            const arr = prev.slice(0, size);
                            while (arr.length < size) arr.push("");
                            return arr;
                          });
                        }}
                      >
                        <option value={4}>4 người</option>
                        <option value={8}>8 người</option>
                        <option value={16}>16 người</option>
                      </select>
                    )}
                  </div>

                  {newTournamentType === "knockout" && (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 8 }}>
                      {Array.from({ length: bracketSize }).map((_, i) => (
                        <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span className="tl-mono" style={{ fontSize: 11, color: "#8D8998", width: 18 }}>{i + 1}</span>
                          <select
                            className="tl-select"
                            style={{ flex: 1 }}
                            value={bracketSlots[i] || ""}
                            onChange={(e) => {
                              const v = e.target.value;
                              setBracketSlots((prev) => {
                                const arr = [...prev];
                                arr[i] = v;
                                return arr;
                              });
                            }}
                          >
                            <option value="">— trống (bye) —</option>
                            {players.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                          </select>
                        </div>
                      ))}
                    </div>
                  )}

                  <div style={{ display: "flex", gap: 6 }}>
                    <button className="tl-btn" onClick={addTournament}><Check size={14} /> Tạo giải đấu</button>
                    <button className="tl-btn" onClick={() => setAddingTournament(false)}><X size={14} /></button>
                  </div>
                </div>
              ) : (
                <button
                  className="tl-btn"
                  onClick={() => {
                    setAddingTournament(true);
                    setBracketSlots(Array(bracketSize).fill(""));
                  }}
                >
                  <Plus size={14} /> Giải đấu mới
                </button>
              )
            )}

            {tournaments.map((t) => {
              const isKnockout = t.type === "knockout";
              return (
              <div key={t.id} style={{ background: "#17151F", border: "1px solid #221F2B", borderRadius: 12, padding: 16 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                  <div className="tl-display" style={{ fontSize: 15, fontWeight: 700 }}>{t.name}</div>
                  {editMode && <Trash2 size={14} style={{ cursor: "pointer", color: "#8D8998" }} onClick={() => deleteTournament(t.id)} />}
                </div>

                {isKnockout ? (
                  <div style={{ display: "flex", gap: 28, overflowX: "auto", paddingBottom: 8 }}>
                    {t.rounds.map((round, ri) => {
                      const label =
                        ri === t.rounds.length - 1 ? "CHUNG KẾT" : ri === t.rounds.length - 2 ? "BÁN KẾT" : ri === t.rounds.length - 3 ? "TỨ KẾT" : `VÒNG ${ri + 1}`;
                      return (
                        <div key={ri} style={{ display: "flex", flexDirection: "column", gap: 16 * Math.pow(2, ri), justifyContent: "center", minWidth: 190 }}>
                          <div className="tl-display" style={{ fontSize: 11, fontWeight: 600, color: "#8D8998", textAlign: "center", letterSpacing: "0.05em" }}>{label}</div>
                          {round.map((m, mi) => {
                            const winnerId = matchWinner(m);
                            const modeIds = m.modeIds || (m.modeId ? [m.modeId] : []);
                            const matchModes = modeIds.map((id) => gamemodes.find((g) => g.id === id)).filter(Boolean);
                            return (
                              <div key={m.id} style={{ background: "#1A1720", border: "1px solid #221F2B", borderRadius: 10, padding: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                                {[["A", m.playerAId], ["B", m.playerBId]].map(([slotKey, pid]) => {
                                  const p = players.find((pl) => pl.id === pid);
                                  return (
                                    <div key={slotKey} style={{ display: "flex", alignItems: "center", gap: 6, opacity: pid ? (winnerId && winnerId !== pid ? 0.45 : 1) : 0.3 }}>
                                      <Avatar name={p?.name || "—"} photoUrl={p?.photoUrl} size={20} />
                                      <span style={{ fontSize: 12, fontWeight: winnerId === pid ? 700 : 500, color: winnerId === pid ? "#FFD54A" : "#F1EFF7", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                        {p?.name || (pid ? "?" : "Chưa có")}
                                      </span>
                                      {editMode && pid ? (
                                        <input
                                          type="number"
                                          className="tl-point-input"
                                          style={{ width: 32 }}
                                          value={slotKey === "A" ? m.scoreA : m.scoreB}
                                          onChange={(e) => updateBracketMatch(t.id, ri, mi, slotKey === "A" ? "scoreA" : "scoreB", e.target.value)}
                                        />
                                      ) : pid ? (
                                        <span className="tl-mono" style={{ fontSize: 12 }}>{slotKey === "A" ? m.scoreA : m.scoreB}</span>
                                      ) : null}
                                    </div>
                                  );
                                })}
                                {editMode && m.playerAId && m.playerBId && (
                                  <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 2 }}>
                                    <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                                      {gamemodes.map((g) => {
                                        const active = modeIds.includes(g.id);
                                        return (
                                          <button
                                            key={g.id}
                                            type="button"
                                            title={g.name}
                                            onClick={() => updateBracketMatch(t.id, ri, mi, "toggleMode", g.id)}
                                            style={{
                                              width: 20,
                                              height: 20,
                                              display: "flex",
                                              alignItems: "center",
                                              justifyContent: "center",
                                              borderRadius: 4,
                                              border: active ? "1px solid #5FAFC4" : "1px solid #2A2733",
                                              background: active ? "rgba(95,175,196,0.15)" : "#1E1E2A",
                                              cursor: "pointer",
                                              padding: 0,
                                            }}
                                          >
                                            <ModeIcon g={g} size={11} />
                                          </button>
                                        );
                                      })}
                                    </div>
                                    <Pin
                                      size={13}
                                      onClick={() => togglePin({ tournamentId: t.id, matchId: m.id, roundIdx: ri })}
                                      style={{
                                        cursor: "pointer",
                                        alignSelf: "flex-end",
                                        color: data?.pinnedMatch?.tournamentId === t.id && data?.pinnedMatch?.matchId === m.id && data?.pinnedMatch?.roundIdx === ri ? "#FFD54A" : "#8D8998",
                                      }}
                                    />
                                  </div>
                                )}
                                {!editMode && matchModes.length > 0 && (
                                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4, flexWrap: "wrap" }}>
                                    {matchModes.map((mode) => <ModeIcon key={mode.id} g={mode} size={12} />)}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {t.matches.length === 0 && <div style={{ fontSize: 12, color: "#57546A" }}>Chưa có trận nào.</div>}
                      {t.matches.map((m) => {
                        const teamAIds = m.teamA || (m.playerAId ? [m.playerAId] : []);
                        const teamBIds = m.teamB || (m.playerBId ? [m.playerBId] : []);
                        const teamAPlayers = teamAIds.map((id) => players.find((p) => p.id === id)).filter(Boolean);
                        const teamBPlayers = teamBIds.map((id) => players.find((p) => p.id === id)).filter(Boolean);
                        const modeIds = m.modeIds || (m.modeId ? [m.modeId] : []);
                        const matchModes = modeIds.map((id) => gamemodes.find((g) => g.id === id)).filter(Boolean);
                        const aWins = m.scoreA > m.scoreB;
                        const bWins = m.scoreB > m.scoreA;
                        return (
                          <div key={m.id} className="tl-card" style={{ justifyContent: "center", alignItems: "flex-start", flexWrap: "wrap" }}>
                            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flex: 1, minWidth: 0 }}>
                              {teamAPlayers.map((p) => (
                                <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                  <span style={{ fontSize: 13, fontWeight: aWins ? 700 : 500, color: aWins ? "#FFD54A" : "#F1EFF7", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 110 }}>{p.name}</span>
                                  <Avatar name={p.name} photoUrl={p.photoUrl} size={22} />
                                </div>
                              ))}
                            </div>
                            <div className="tl-mono" style={{ minWidth: 90, textAlign: "center", fontSize: 15, fontWeight: 700, flexShrink: 0, paddingTop: 2 }}>
                              {editMode ? (
                                <span style={{ display: "inline-flex", alignItems: "center", gap: 4, justifyContent: "center" }}>
                                  <input type="number" className="tl-point-input" style={{ width: 38 }} value={m.scoreA} onChange={(e) => updateMatchScore(t.id, m.id, "scoreA", e.target.value)} />
                                  :
                                  <input type="number" className="tl-point-input" style={{ width: 38 }} value={m.scoreB} onChange={(e) => updateMatchScore(t.id, m.id, "scoreB", e.target.value)} />
                                </span>
                              ) : (
                                <>{m.scoreA} : {m.scoreB}</>
                              )}
                              {!editMode && matchModes.length > 0 && (
                                <div style={{ marginTop: 4, display: "flex", justifyContent: "center", gap: 4, flexWrap: "wrap" }}>
                                  {matchModes.map((mode) => <ModeIcon key={mode.id} g={mode} size={14} />)}
                                </div>
                              )}
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 4, flex: 1, minWidth: 0 }}>
                              {teamBPlayers.map((p) => (
                                <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                  <Avatar name={p.name} photoUrl={p.photoUrl} size={22} />
                                  <span style={{ fontSize: 13, fontWeight: bWins ? 700 : 500, color: bWins ? "#FFD54A" : "#F1EFF7", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 110 }}>{p.name}</span>
                                </div>
                              ))}
                            </div>
                            {editMode && (
                              <div style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 3, flexWrap: "wrap", marginTop: 4 }}>
                                {gamemodes.map((g) => {
                                  const active = modeIds.includes(g.id);
                                  return (
                                    <button
                                      key={g.id}
                                      type="button"
                                      title={g.name}
                                      onClick={() => updateMatchModes(t.id, m.id, g.id)}
                                      style={{
                                        width: 22,
                                        height: 22,
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        borderRadius: 5,
                                        border: active ? "1px solid #5FAFC4" : "1px solid #2A2733",
                                        background: active ? "rgba(95,175,196,0.15)" : "#1E1E2A",
                                        cursor: "pointer",
                                        padding: 0,
                                      }}
                                    >
                                      <ModeIcon g={g} size={12} />
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                            {editMode && (
                              <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: 6, flexShrink: 0 }}>
                                <Pin
                                  size={14}
                                  onClick={() => togglePin({ tournamentId: t.id, matchId: m.id })}
                                  style={{
                                    cursor: "pointer",
                                    color: data?.pinnedMatch?.tournamentId === t.id && data?.pinnedMatch?.matchId === m.id ? "#FFD54A" : "#8D8998",
                                  }}
                                />
                                <X size={14} style={{ cursor: "pointer", color: "#8D8998" }} onClick={() => deleteMatch(t.id, m.id)} />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {editMode && (
                      addingMatchFor === t.id ? (
                        <div style={{ marginTop: 10, background: "#1A1720", border: "1px solid #221F2B", borderRadius: 10, padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
                          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                            <div style={{ flex: 1, minWidth: 160 }}>
                              <div className="tl-mono" style={{ fontSize: 10, color: "#8D8998", marginBottom: 4 }}>ĐỘI A ({matchDraft.teamA.length})</div>
                              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                                {players.map((p) => {
                                  const inA = matchDraft.teamA.includes(p.id);
                                  const inB = matchDraft.teamB.includes(p.id);
                                  return (
                                    <button
                                      key={p.id}
                                      type="button"
                                      disabled={inB}
                                      onClick={() => toggleDraftPlayer("A", p.id)}
                                      style={{
                                        fontSize: 11,
                                        padding: "3px 9px",
                                        borderRadius: 12,
                                        border: inA ? "1px solid #5FAFC4" : "1px solid #2A2733",
                                        background: inA ? "rgba(95,175,196,0.15)" : "#1E1E2A",
                                        color: inB ? "#4A4855" : "#F1EFF7",
                                        cursor: inB ? "not-allowed" : "pointer",
                                      }}
                                    >
                                      {p.name}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                            <div style={{ flex: 1, minWidth: 160 }}>
                              <div className="tl-mono" style={{ fontSize: 10, color: "#8D8998", marginBottom: 4 }}>ĐỘI B ({matchDraft.teamB.length})</div>
                              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                                {players.map((p) => {
                                  const inA = matchDraft.teamA.includes(p.id);
                                  const inB = matchDraft.teamB.includes(p.id);
                                  return (
                                    <button
                                      key={p.id}
                                      type="button"
                                      disabled={inA}
                                      onClick={() => toggleDraftPlayer("B", p.id)}
                                      style={{
                                        fontSize: 11,
                                        padding: "3px 9px",
                                        borderRadius: 12,
                                        border: inB ? "1px solid #5FAFC4" : "1px solid #2A2733",
                                        background: inB ? "rgba(95,175,196,0.15)" : "#1E1E2A",
                                        color: inA ? "#4A4855" : "#F1EFF7",
                                        cursor: inA ? "not-allowed" : "pointer",
                                      }}
                                    >
                                      {p.name}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            <div className="tl-mono" style={{ fontSize: 10, color: "#8D8998" }}>CHẾ ĐỘ THI ĐẤU ({matchDraft.modeIds.length})</div>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                              {gamemodes.map((g) => {
                                const active = matchDraft.modeIds.includes(g.id);
                                return (
                                  <button
                                    key={g.id}
                                    type="button"
                                    onClick={() => toggleDraftMode(g.id)}
                                    style={{
                                      fontSize: 11,
                                      padding: "3px 9px",
                                      borderRadius: 12,
                                      display: "inline-flex",
                                      alignItems: "center",
                                      gap: 4,
                                      border: active ? "1px solid #5FAFC4" : "1px solid #2A2733",
                                      background: active ? "rgba(95,175,196,0.15)" : "#1E1E2A",
                                      color: "#F1EFF7",
                                      cursor: "pointer",
                                    }}
                                  >
                                    <ModeIcon g={g} size={12} /> {g.name}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                            <input type="number" className="tl-point-input" placeholder="0" value={matchDraft.scoreA} onChange={(e) => setMatchDraft((d) => ({ ...d, scoreA: e.target.value }))} />
                            <span className="tl-mono" style={{ fontSize: 12, color: "#8D8998" }}>vs</span>
                            <input type="number" className="tl-point-input" placeholder="0" value={matchDraft.scoreB} onChange={(e) => setMatchDraft((d) => ({ ...d, scoreB: e.target.value }))} />
                            <button className="tl-btn" onClick={() => addMatch(t.id)}><Check size={14} /> Thêm trận</button>
                            <button className="tl-btn" onClick={() => { setAddingMatchFor(null); setMatchDraft({ teamA: [], teamB: [], modeIds: [], scoreA: 0, scoreB: 0 }); }}><X size={14} /></button>
                          </div>
                        </div>
                      ) : (
                        <button className="tl-btn" style={{ marginTop: 10 }} onClick={() => setAddingMatchFor(t.id)}><Plus size={14} /> Thêm trận đấu</button>
                      )
                    )}
                  </>
                )}
              </div>
              );
            })}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
            {[1, 2, 3, 4, 5, "UR", "RET"].map((groupKey) => {
              const entries = groupedForMode[groupKey] || [];
              if (!editMode && entries.length === 0) return null;
              if (groupKey === "UR" && !editMode) return null;
              if (groupKey === "RET" && entries.length === 0) return null;
              const isRet = groupKey === "RET";
              const c = isRet ? { edge: "#57546A", text: "#8D8998" } : GROUP_COLOR[groupKey];
              const label = isRet ? "ĐÃ NGHỈ HƯU" : groupKey === "UR" ? "CHƯA XẾP HẠNG" : `TIER ${groupKey}`;
              return (
                <div key={groupKey}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                    <div className="tl-display" style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.08em", color: c.text, minWidth: 100 }}>{label}</div>
                    <div style={{ flex: 1, height: 3, borderRadius: 2, background: c.edge, opacity: groupKey === "UR" || isRet ? 0.3 : 0.9 - (groupKey - 1) * 0.05 }} />
                  </div>
                  {entries.length === 0 ? (
                    <div style={{ fontSize: 12, color: "#57546A", paddingLeft: 2 }}>Chưa có ai</div>
                  ) : (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 8 }}>
                      {entries.map(({ player, meta, isRetired }) => (
                        <div key={player.id} className="tl-card" style={{ borderLeft: `3px solid ${c.edge}`, opacity: isRetired ? 0.6 : 1 }}>
                          <Avatar name={player.name} photoUrl={player.photoUrl} size={28} />
                          <div style={{ flex: 1, fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{player.name}</div>
                          {editMode ? (
                            <>
                              <select className="tl-select" value={meta.code} onChange={(e) => setRank(player.id, activeMode.id, e.target.value)}>
                                <option value="UR">—</option>
                                {TIER_CODES.map((code) => <option key={code} value={code}>{code}</option>)}
                              </select>
                              <Ban
                                size={14}
                                title={isRetired ? "Bỏ nghỉ hưu" : "Đánh dấu nghỉ hưu"}
                                onClick={() => toggleRetired(player.id, activeMode.id)}
                                style={{ cursor: "pointer", color: isRetired ? "#E8432B" : "#8D8998", flexShrink: 0 }}
                              />
                            </>
                          ) : isRetired ? (
                            <span className="tl-mono" style={{ fontSize: 10, color: "#8D8998" }}>Nghỉ hưu</span>
                          ) : (
                            <span className="tl-mono" style={{ fontSize: 11, color: c.text }}>{meta.points}pt</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {selectedPlayerId && (() => {
        const player = players.find((pl) => pl.id === selectedPlayerId);
        if (!player) return null;
        return (
          <div
            onClick={() => setSelectedPlayerId(null)}
            style={{ position: "fixed", inset: 0, background: "rgba(5,5,8,0.72)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 50 }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{ background: "#131119", border: "1px solid #221F2B", borderRadius: 16, width: "100%", maxWidth: 420, maxHeight: "85vh", overflowY: "auto" }}
            >
              <div style={{ padding: "22px 22px 16px", borderBottom: "1px solid #1E1C27", display: "flex", alignItems: "center", gap: 14 }}>
                <Avatar name={player.name} photoUrl={player.photoUrl} size={54} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="tl-display" style={{ fontSize: 18, fontWeight: 700 }}>{player.name}</div>
                  <div className="tl-mono" style={{ fontSize: 12, color: "#8D8998", marginTop: 2 }}>
                    Tổng điểm: <span style={{ color: "#F1EFF7", fontWeight: 600 }}>{totals[player.id]}</span>
                  </div>
                </div>
                <X size={18} onClick={() => setSelectedPlayerId(null)} style={{ cursor: "pointer", color: "#8D8998", flexShrink: 0 }} />
              </div>
              <div style={{ padding: "12px 22px 0" }}>
                <button className="tl-btn" style={{ width: "100%", justifyContent: "center" }} onClick={() => exportCard(player)}>
                  <Download size={14} /> Tải ảnh thẻ bài
                </button>
              </div>
              <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 6 }}>
                {gamemodes.map((g) => {
                  const meta = tierMeta(player.ranks[g.id], tierPoints);
                  const isRetired = !!player.retired?.[g.id];
                  const c = GROUP_COLOR[meta.group];
                  return (
                    <div key={g.id} style={{ display: "flex", alignItems: "center", gap: 10, background: "#17151F", border: "1px solid #221F2B", borderRadius: 10, padding: "10px 12px", borderLeft: `3px solid ${c.edge}`, opacity: isRetired ? 0.6 : 1 }}>
                      <span style={{ width: 22, display: "flex", justifyContent: "center" }}><ModeIcon g={g} size={18} /></span>
                      <span style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{g.name}</span>
                      {isRetired && (
                        <span className="tl-mono" style={{ fontSize: 10, padding: "2px 6px", borderRadius: 5, background: "rgba(87,84,106,0.2)", color: "#8D8998" }}>NGHỈ HƯU</span>
                      )}
                      <span className="tl-mono" style={{ fontSize: 12, padding: "2px 8px", borderRadius: 5, background: c.bg, color: c.text, fontWeight: 600 }}>
                        {meta.code === "UR" ? "Chưa xếp" : meta.code}
                      </span>
                      <span className="tl-mono" style={{ fontSize: 11, color: "#8D8998", minWidth: 32, textAlign: "right" }}>{meta.points}pt</span>
                    </div>
                  );
                })}
                {gamemodes.length === 0 && (
                  <div style={{ fontSize: 12, color: "#57546A", textAlign: "center", padding: "16px 0" }}>Chưa có chế độ chơi nào.</div>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}