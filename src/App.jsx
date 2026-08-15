import { useState, useEffect, useMemo } from "react";
import { Flame, Plus, X, Trash2, Settings, Trophy, Pencil, Check, Sliders } from "lucide-react";
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

const DOC_REF_PATH = ["tierLadder", "data"];
const uid = () => Math.random().toString(36).slice(2, 10);

function tierMeta(code, points) {
  if (!code || code === "UR") return { code: "UR", group: "UR", points: 0 };
  return { code, group: TIER_GROUP[code], points: points?.[code] ?? DEFAULT_POINTS[code] };
}

function initials(name) {
  return name.trim().split(/\s+/).slice(-2).map((w) => w[0]?.toUpperCase()).join("");
}

function Avatar({ name, photoUrl, size }) {
  const s = { width: size, height: size, borderRadius: "50%", flexShrink: 0, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.36, fontWeight: 600, background: "#221F2B" };
  if (photoUrl) return <img src={photoUrl} alt="" style={{ ...s, objectFit: "cover" }} onError={(e) => { e.target.style.display = "none"; }} />;
  return <div style={s}>{initials(name)}</div>;
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
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const [renamePhotoValue, setRenamePhotoValue] = useState("");
  const [showPoints, setShowPoints] = useState(false);
  const [saveError, setSaveError] = useState(false);

  useEffect(() => {
    const ref = doc(db, ...DOC_REF_PATH);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) {
          const parsed = snap.data();
          setData({ gamemodes: DEFAULT_MODES, players: [], tierPoints: { ...DEFAULT_POINTS }, ...parsed });
        } else {
          setData({ gamemodes: DEFAULT_MODES, players: [], tierPoints: { ...DEFAULT_POINTS } });
        }
        setLoading(false);
      },
      () => {
        setData({ gamemodes: DEFAULT_MODES, players: [], tierPoints: { ...DEFAULT_POINTS } });
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

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
      players: players.map((p) =>
        p.id === playerId ? { ...p, ranks: { ...p.ranks, [modeId]: code === "UR" ? undefined : code } } : p
      ),
    });
  }

  function addMode() {
    const name = newModeName.trim();
    if (!name) return;
    const id = uid();
    persist({ ...data, gamemodes: [...gamemodes, { id, name, icon: newModeIcon.trim() || "⚔️" }] });
    setNewModeName("");
    setNewModeIcon("⚔️");
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

  function setTierPoint(code, value) {
    const n = Math.max(0, Math.min(999, Number(value) || 0));
    persist({ ...data, tierPoints: { ...tierPoints, [code]: n } });
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

  const activeMode = gamemodes.find((g) => g.id === activeTab);

  const groupedForMode = useMemo(() => {
    if (!activeMode) return [];
    const groups = { 1: [], 2: [], 3: [], 4: [], 5: [], UR: [] };
    for (const p of players) {
      const meta = tierMeta(p.ranks[activeMode.id], tierPoints);
      groups[meta.group].push({ player: p, meta });
    }
    for (const k of Object.keys(groups)) groups[k].sort((a, b) => a.player.name.localeCompare(b.player.name));
    return groups;
  }, [players, activeMode, tierPoints]);

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
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18, gap: 10, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Flame size={22} color="#E8432B" />
            <div>
              <div className="tl-display" style={{ fontSize: 20, fontWeight: 700, letterSpacing: "0.02em" }}>TIER LADDER</div>
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
              onClick={() => setEditMode((e) => !e)}
              style={editMode ? { background: "#5FAFC4", color: "#0D0C12", borderColor: "#5FAFC4" } : {}}
            >
              <Settings size={14} /> {editMode ? "Đang chỉnh sửa" : "Chế độ Admin"}
            </button>
          </div>
        </div>

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

        <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 12 }}>
          <div
            className="tl-tab"
            onClick={() => setActiveTab("overall")}
            style={{ display: "flex", alignItems: "center", gap: 6, background: activeTab === "overall" ? "#1E1E2A" : "transparent", borderColor: activeTab === "overall" ? "#2A2733" : "transparent", color: activeTab === "overall" ? "#F1EFF7" : "#8D8998" }}
          >
            <Trophy size={13} /> TỔNG
          </div>
          {gamemodes.map((g) => (
            <div
              key={g.id}
              className="tl-tab"
              onClick={() => setActiveTab(g.id)}
              style={{ background: activeTab === g.id ? "#1E1E2A" : "transparent", borderColor: activeTab === g.id ? "#2A2733" : "transparent", color: activeTab === g.id ? "#F1EFF7" : "#8D8998", display: "flex", alignItems: "center", gap: 8 }}
            >
              <span style={{ fontSize: 14 }}>{g.icon || "⚔️"}</span>
              {g.name.toUpperCase()}
              {editMode && (
                <X size={12} onClick={(e) => { e.stopPropagation(); removeMode(g.id); }} style={{ opacity: 0.6 }} />
              )}
            </div>
          ))}
          {editMode &&
            (addingMode ? (
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <input className="tl-input" style={{ width: 44, padding: "6px 8px", fontSize: 14, textAlign: "center" }} value={newModeIcon} onChange={(e) => setNewModeIcon(e.target.value)} placeholder="⚔️" />
                <input
                  className="tl-input"
                  autoFocus
                  placeholder="Tên chế độ"
                  value={newModeName}
                  onChange={(e) => setNewModeName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addMode()}
                  style={{ padding: "6px 8px", fontSize: 12, width: 140 }}
                />
                <Check size={16} onClick={addMode} style={{ cursor: "pointer", color: "#5FAFC4" }} />
                <X size={16} onClick={() => setAddingMode(false)} style={{ cursor: "pointer", color: "#8D8998" }} />
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

        {activeTab === "overall" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {overallSorted.map((p, i) => (
              <div key={p.id} className="tl-card">
                <div className="tl-mono" style={{ width: 24, textAlign: "right", color: "#8D8998", fontSize: 13 }}>{i + 1}</div>
                <Avatar name={p.name} photoUrl={p.photoUrl} size={34} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  {renamingId === p.id ? (
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <input className="tl-input" autoFocus placeholder="Tên" value={renameValue} onChange={(e) => setRenameValue(e.target.value)} style={{ padding: "4px 8px", fontSize: 13, width: 140 }} />
                      <input className="tl-input" placeholder="Link ảnh (tuỳ chọn)" value={renamePhotoValue} onChange={(e) => setRenamePhotoValue(e.target.value)} style={{ padding: "4px 8px", fontSize: 13, width: 180 }} />
                      <Check size={16} onClick={() => saveEdit(p.id)} style={{ cursor: "pointer", color: "#5FAFC4", alignSelf: "center" }} />
                      <X size={16} onClick={() => setRenamingId(null)} style={{ cursor: "pointer", color: "#8D8998", alignSelf: "center" }} />
                    </div>
                  ) : (
                    <div style={{ fontSize: 14, fontWeight: 500 }}>{p.name}</div>
                  )}
                  <div style={{ display: "flex", gap: 4, marginTop: 4, flexWrap: "wrap" }}>
                    {gamemodes.map((g) => {
                      const meta = tierMeta(p.ranks[g.id], tierPoints);
                      const c = GROUP_COLOR[meta.group];
                      return (
                        <span key={g.id} title={g.name} className="tl-mono" style={{ fontSize: 10, padding: "1px 5px", borderRadius: 4, background: c.bg, color: c.text }}>
                          {meta.code === "UR" ? "—" : meta.code}
                        </span>
                      );
                    })}
                  </div>
                </div>
                <div className="tl-mono" style={{ fontSize: 16, fontWeight: 600, minWidth: 40, textAlign: "right" }}>{totals[p.id]}</div>
                {editMode && (
                  <div style={{ display: "flex", gap: 6, marginLeft: 6 }}>
                    <Pencil size={14} style={{ cursor: "pointer", color: "#8D8998" }} onClick={() => { setRenamingId(p.id); setRenameValue(p.name); setRenamePhotoValue(p.photoUrl || ""); }} />
                    <Trash2 size={14} style={{ cursor: "pointer", color: "#8D8998" }} onClick={() => removePlayer(p.id)} />
                  </div>
                )}
              </div>
            ))}

            {editMode && (
              <div style={{ marginTop: 10 }}>
                {addingPlayer ? (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <input className="tl-input" autoFocus placeholder="Tên thành viên" value={newPlayerName} onChange={(e) => setNewPlayerName(e.target.value)} style={{ flex: "1 1 160px" }} />
                    <input className="tl-input" placeholder="Link ảnh (tuỳ chọn)" value={newPlayerPhoto} onChange={(e) => setNewPlayerPhoto(e.target.value)} style={{ flex: "1 1 200px" }} onKeyDown={(e) => e.key === "Enter" && addPlayer()} />
                    <button className="tl-btn" onClick={addPlayer}><Check size={14} /> Thêm</button>
                    <button className="tl-btn" onClick={() => setAddingPlayer(false)}><X size={14} /></button>
                  </div>
                ) : (
                  <button className="tl-btn" onClick={() => setAddingPlayer(true)}><Plus size={14} /> Thêm thành viên</button>
                )}
              </div>
            )}

            {saveError && <div style={{ fontSize: 12, color: "#E8432B", marginTop: 8 }}>Lưu dữ liệu thất bại — thử lại thao tác vừa rồi.</div>}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
            {[1, 2, 3, 4, 5, "UR"].map((groupKey) => {
              const entries = groupedForMode[groupKey] || [];
              if (!editMode && entries.length === 0) return null;
              if (groupKey === "UR" && !editMode) return null;
              const c = GROUP_COLOR[groupKey];
              const label = groupKey === "UR" ? "CHƯA XẾP HẠNG" : `TIER ${groupKey}`;
              return (
                <div key={groupKey}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                    <div className="tl-display" style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.08em", color: c.text, minWidth: 100 }}>{label}</div>
                    <div style={{ flex: 1, height: 3, borderRadius: 2, background: c.edge, opacity: groupKey === "UR" ? 0.3 : 0.9 - (groupKey - 1) * 0.05 }} />
                  </div>
                  {entries.length === 0 ? (
                    <div style={{ fontSize: 12, color: "#57546A", paddingLeft: 2 }}>Chưa có ai</div>
                  ) : (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 8 }}>
                      {entries.map(({ player, meta }) => (
                        <div key={player.id} className="tl-card" style={{ borderLeft: `3px solid ${c.edge}` }}>
                          <Avatar name={player.name} photoUrl={player.photoUrl} size={28} />
                          <div style={{ flex: 1, fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{player.name}</div>
                          {editMode ? (
                            <select className="tl-select" value={meta.code} onChange={(e) => setRank(player.id, activeMode.id, e.target.value)}>
                              <option value="UR">—</option>
                              {TIER_CODES.map((code) => <option key={code} value={code}>{code}</option>)}
                            </select>
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
    </div>
  );
}
