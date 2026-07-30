/**
 * PantryGroupSelector.tsx - Dropdown for switching between personal
 * and shared pantries.
 *
 * Every row has a gear icon. "My Pantry" gear has a share toggle: OFF if no
 * owned group exists, ON once one is created — shows the invite code inline.
 * Shared group gears show invite code, invite-by-email, and delete.
 * Footer has Create Pantry + Join Pantry buttons for additional groups.
 */
import { useState, useRef, useEffect } from "react";
import {
  Users,
  Plus,
  Copy,
  Check,
  LogIn,
  Trash2,
  Mail,
  ChevronDown,
  Settings,
  RotateCcw,
} from "lucide-react";
import {
  usePantryGroups,
  useCreatePantryGroup,
  useJoinPantryGroup,
  useInviteToPantryGroup,
  useDeletePantryGroup,
  useResetDemo,
} from "../hooks";
import ConfirmDialog from "./ConfirmDialog";
import { usePantrySelection } from "../context/PantryContext";
import type { ShowToast, PantryGroup } from "../types";
import "./PantryGroupSelector.css";

interface GroupWithMeta extends PantryGroup {
  member_count?: number;
  user_role?: string;
}

interface Props {
  showToast: ShowToast;
}

const PantryGroupSelector: React.FC<Props> = ({ showToast }) => {
  const { selectedGroupId, setSelectedGroupId: onSelectGroup } = usePantrySelection();
  const [showCreateInput, setShowCreateInput] = useState<boolean>(false);
  const [showJoinInput, setShowJoinInput] = useState<boolean>(false);
  const [showInviteInput, setShowInviteInput] = useState<number | null>(null);
  const [expandedGroupId, setExpandedGroupId] = useState<number | string | null>(null);
  const [newGroupName, setNewGroupName] = useState<string>("");
  const [inviteCode, setInviteCode] = useState<string>("");
  const [inviteEmail, setInviteEmail] = useState<string>("");
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [confirmDeleteGroupId, setConfirmDeleteGroupId] = useState<number | null>(null);
  const [pendingSwitchTo, setPendingSwitchTo] = useState<{ id: number | null; name: string } | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState<boolean>(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const { data: groups = [] } = usePantryGroups() as { data: GroupWithMeta[] | undefined };
  const createMutation = useCreatePantryGroup();
  const joinMutation = useJoinPantryGroup();
  const inviteMutation = useInviteToPantryGroup();
  const deleteMutation = useDeletePantryGroup();
  const resetDemoMutation = useResetDemo();

  const selectedGroup = (groups as GroupWithMeta[]).find((g) => g.id === selectedGroupId);

  // The demo pantry is a real group named "Demo Pantry" returned by the fetch.
  const demoGroup = (groups as GroupWithMeta[]).find((g) => g.name === "Demo Pantry");
  const isDemoSelected = demoGroup != null && selectedGroupId === demoGroup.id;

  // Close the dropdown when clicking outside (mirrors the nav Finance dropdown).
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const handleResetDemo = async () => {
    try {
      await resetDemoMutation.mutateAsync();
      if (showToast) showToast("Demo pantry reset to sample items", "success");
    } catch (error: unknown) {
      if (showToast) showToast((error as Error).message || "Failed to reset demo pantry", "error");
    }
    setShowResetConfirm(false);
  };

  // The first owned group is tied to "My Pantry" share toggle. Exclude the demo
  // pantry — it is a real owned group, but must never bind to the personal
  // sharing toggle (disabling sharing would delete the user's demo pantry).
  const ownedGroup = (groups as GroupWithMeta[]).find(
    (g) => g.user_role === "owner" && g.name !== "Demo Pantry"
  );
  const isSharingEnabled = !!ownedGroup;

  const handleEnableSharing = async () => {
    if (isSharingEnabled) return;
    try {
      await createMutation.mutateAsync("My Pantry");
      if (showToast) showToast("Sharing enabled! Share the invite code.", "success");
    } catch (error: unknown) {
      if (showToast) showToast((error as Error).message, "error");
    }
  };

  const handleDisableSharing = async () => {
    if (!ownedGroup) return;
    try {
      await deleteMutation.mutateAsync(ownedGroup.id);
      if (selectedGroupId === ownedGroup.id) {
        onSelectGroup(null);
      }
      if (showToast) showToast("Sharing disabled. Your items are still here.", "success");
    } catch (error: unknown) {
      if (showToast) showToast((error as Error).message, "error");
    }
  };

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) return;
    try {
      await createMutation.mutateAsync(newGroupName.trim());
      setNewGroupName("");
      setShowCreateInput(false);
    } catch (error: unknown) {
      if (showToast) showToast((error as Error).message, "error");
    }
  };

  const handleJoin = async () => {
    if (!inviteCode.trim()) return;
    try {
      const result = await joinMutation.mutateAsync(inviteCode.trim()) as { group?: { id: number } };
      setInviteCode("");
      setShowJoinInput(false);
      if (result.group) {
        onSelectGroup(result.group.id);
      }
    } catch (error: unknown) {
      if (showToast) showToast((error as Error).message, "error");
    }
  };

  const handleInvite = async (groupId: number) => {
    if (!inviteEmail.trim()) return;
    try {
      await inviteMutation.mutateAsync({ groupId, email: inviteEmail.trim() });
      setInviteEmail("");
      setShowInviteInput(null);
      if (showToast) showToast("Invite sent", "success");
    } catch (error: unknown) {
      if (showToast) showToast((error as Error).message, "error");
    }
  };

  const handleDelete = async (groupId: number) => {
    try {
      await deleteMutation.mutateAsync(groupId);
      if (selectedGroupId === groupId) {
        onSelectGroup(null);
      }
      setExpandedGroupId(null);
    } catch (error: unknown) {
      if (showToast) showToast((error as Error).message, "error");
    }
    setConfirmDeleteGroupId(null);
  };

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const handleSwitchPantry = (id: number | null, name: string) => {
    if (id === selectedGroupId) {
      setIsOpen(false);
      return;
    }
    // Close the dropdown so the confirm dialog isn't obscured by it (the nav
    // creates a stacking context that can trap the fixed-position modal).
    setIsOpen(false);
    setPendingSwitchTo({ id, name });
  };

  const confirmSwitch = () => {
    if (pendingSwitchTo) {
      onSelectGroup(pendingSwitchTo.id);
      setIsOpen(false);
      setExpandedGroupId(null);
    }
    setPendingSwitchTo(null);
  };

  const toggleExpand = (id: number | string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedGroupId(expandedGroupId === id ? null : id);
    setShowInviteInput(null);
  };

  return (
    <div className="pantry-group-selector" ref={rootRef}>
      <div className="group-selector-toggle" onClick={() => setIsOpen(!isOpen)}>
        <div className="group-selector-label">
          <Users size={16} />
          <span className="group-selector-name">{selectedGroup ? selectedGroup.name : "My Pantry"}</span>
          {/* Member count is only meaningful for real shared groups — not the
              demo sandbox (single-user) or the personal pantry. */}
          {selectedGroup && !isDemoSelected && (
            <span className="group-member-count">
              {selectedGroup.member_count || 1} member{(selectedGroup.member_count || 1) === 1 ? "" : "s"}
            </span>
          )}
        </div>
        <ChevronDown size={16} className={`chevron ${isOpen ? "open" : ""}`} />
      </div>

      {isOpen && (
        <div className="group-dropdown">
          {/* Reset action — only while the demo pantry is selected */}
          {isDemoSelected && (
            <button
              className="group-action-btn demo-reset-btn"
              onClick={() => { setIsOpen(false); setShowResetConfirm(true); }}
              disabled={resetDemoMutation.isPending}
            >
              <RotateCcw size={14} />
              <span>{resetDemoMutation.isPending ? "Resetting..." : "Reset Demo Pantry"}</span>
            </button>
          )}

          {/* Personal pantry */}
          <div className="group-option-wrapper">
            <div className="group-option-row">
              <button
                className={`group-option ${!selectedGroupId ? "active" : ""}`}
                onClick={() => handleSwitchPantry(null, "My Pantry")}
              >
                <span>My Pantry</span>
              </button>
              <button
                className="group-edit-btn"
                onClick={(e) => toggleExpand("personal", e)}
                title="Settings"
              >
                <Settings size={15} />
              </button>
            </div>
            {expandedGroupId === "personal" && (
              <div className="group-actions">
                <div className="share-toggle-row">
                  <label className="toggle-label">Shared</label>
                  {isSharingEnabled ? (
                    <button
                      className="toggle-switch on"
                      onClick={handleDisableSharing}
                      disabled={deleteMutation.isPending}
                    >
                      <div className="toggle-knob" />
                    </button>
                  ) : (
                    <button
                      className="toggle-switch off"
                      onClick={handleEnableSharing}
                      disabled={createMutation.isPending}
                    >
                      <div className="toggle-knob" />
                    </button>
                  )}
                </div>
                {isSharingEnabled && ownedGroup ? (
                  <div className="invite-code-display">
                    <span className="code-label">Invite code:</span>
                    <code>{ownedGroup.invite_code}</code>
                    <button
                      className="copy-btn"
                      onClick={() => handleCopyCode(ownedGroup.invite_code!)}
                      title="Copy invite code"
                    >
                      {copiedCode === ownedGroup.invite_code ? <Check size={14} /> : <Copy size={14} />}
                    </button>
                  </div>
                ) : (
                  <p className="share-hint">
                    Turn on to create a shared pantry others can join.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Demo pantry — selectable, but WITHOUT owner-management controls
              (no invite/delete gear): it is a personal sandbox, not a shareable
              group. Reset lives at the top of the dropdown when it's selected. */}
          {demoGroup && (
            <div className="group-option-wrapper">
              <div className="group-option-row">
                <button
                  className={`group-option ${selectedGroupId === demoGroup.id ? "active" : ""}`}
                  onClick={() => handleSwitchPantry(demoGroup.id, demoGroup.name)}
                >
                  <div className="group-option-info">
                    <span>{demoGroup.name}</span>
                    <span className="group-meta">Sandbox</span>
                  </div>
                </button>
              </div>
            </div>
          )}

          {/* Shared groups — exclude the demo pantry (rendered above without a gear) */}
          {(groups as GroupWithMeta[]).filter((group) => group.name !== "Demo Pantry").map((group) => (
            <div key={group.id} className="group-option-wrapper">
              <div className="group-option-row">
                <button
                  className={`group-option ${selectedGroupId === group.id ? "active" : ""}`}
                  onClick={() => handleSwitchPantry(group.id, group.name)}
                >
                  <div className="group-option-info">
                    <span>{group.name}</span>
                    <span className="group-meta">
                      {group.member_count || 1} member{(group.member_count || 1) === 1 ? "" : "s"}
                      {group.user_role === "owner" ? " \u00B7 Owner" : ""}
                    </span>
                  </div>
                </button>
                <button
                  className="group-edit-btn"
                  onClick={(e) => toggleExpand(group.id, e)}
                  title="Manage group"
                >
                  <Settings size={15} />
                </button>
              </div>
              {expandedGroupId === group.id && (
                <div className="group-actions">
                  <div className="share-toggle-row">
                    <label className="toggle-label">Shared</label>
                    <div className="toggle-switch on">
                      <div className="toggle-knob" />
                    </div>
                  </div>
                  <div className="invite-code-display">
                    <span className="code-label">Invite code:</span>
                    <code>{group.invite_code}</code>
                    <button
                      className="copy-btn"
                      onClick={() => handleCopyCode(group.invite_code!)}
                      title="Copy invite code"
                    >
                      {copiedCode === group.invite_code ? <Check size={14} /> : <Copy size={14} />}
                    </button>
                  </div>
                  {group.user_role === "owner" && (
                    <>
                      <button
                        className="group-action-btn invite-btn"
                        onClick={() => setShowInviteInput(showInviteInput === group.id ? null : group.id)}
                      >
                        <Mail size={14} />
                        <span>Invite by Email</span>
                      </button>
                      {showInviteInput === group.id && (
                        <div className="inline-input">
                          <input
                            type="email"
                            value={inviteEmail}
                            onChange={(e) => setInviteEmail(e.target.value)}
                            placeholder="Email address"
                            onKeyDown={(e) => e.key === "Enter" && handleInvite(group.id)}
                          />
                          <button onClick={() => handleInvite(group.id)} disabled={inviteMutation.isPending}>
                            Send
                          </button>
                        </div>
                      )}
                      <button
                        className="group-action-btn delete-btn"
                        onClick={() => setConfirmDeleteGroupId(group.id)}
                        disabled={deleteMutation.isPending}
                      >
                        <Trash2 size={14} />
                        <span>Delete Group</span>
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}

          {/* Footer: Create + Join */}
          <div className="group-footer-actions">
            {!showCreateInput && !showJoinInput && (
              <>
                <button
                  className="group-footer-btn"
                  onClick={() => { setShowCreateInput(true); setShowJoinInput(false); }}
                >
                  <Plus size={14} />
                  <span>Create Pantry</span>
                </button>
                <button
                  className="group-footer-btn"
                  onClick={() => { setShowJoinInput(true); setShowCreateInput(false); }}
                >
                  <LogIn size={14} />
                  <span>Join Pantry</span>
                </button>
              </>
            )}

            {showCreateInput && (
              <div className="inline-input">
                <input
                  type="text"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  placeholder="Pantry name"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreateGroup();
                    if (e.key === "Escape") setShowCreateInput(false);
                  }}
                />
                <button onClick={handleCreateGroup} disabled={createMutation.isPending}>
                  Create
                </button>
                <button className="cancel-btn" onClick={() => setShowCreateInput(false)}>
                  Cancel
                </button>
              </div>
            )}

            {showJoinInput && (
              <div className="inline-input">
                <input
                  type="text"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  placeholder="Invite code"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleJoin();
                    if (e.key === "Escape") setShowJoinInput(false);
                  }}
                />
                <button onClick={handleJoin} disabled={joinMutation.isPending}>Join</button>
                <button className="cancel-btn" onClick={() => setShowJoinInput(false)}>Cancel</button>
              </div>
            )}
          </div>
        </div>
      )}
      {confirmDeleteGroupId && (
        <ConfirmDialog
          message="Delete this shared pantry? All items will be removed."
          confirmLabel="Delete"
          onConfirm={() => handleDelete(confirmDeleteGroupId)}
          onCancel={() => setConfirmDeleteGroupId(null)}
        />
      )}
      {pendingSwitchTo && (
        <ConfirmDialog
          message={`Switch to "${pendingSwitchTo.name}"? All stats and pantry data throughout the app will reflect this pantry.`}
          confirmLabel="Switch"
          danger={false}
          onConfirm={confirmSwitch}
          onCancel={() => setPendingSwitchTo(null)}
        />
      )}
      {showResetConfirm && (
        <ConfirmDialog
          message="Reset the demo pantry back to its original sample items? Any changes you made to it will be discarded. Your real pantries are unaffected."
          confirmLabel="Reset"
          onConfirm={handleResetDemo}
          onCancel={() => setShowResetConfirm(false)}
        />
      )}
    </div>
  );
};

export default PantryGroupSelector;
