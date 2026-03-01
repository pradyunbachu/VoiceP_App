/**
 * ShoppingListGroupSelector.jsx - Dropdown for switching between personal
 * and shared shopping lists.
 *
 * Allows users to select a shared list group, create new groups, join via
 * invite code, invite members by email, copy invite codes, and delete groups.
 * Only group owners see the invite and delete actions.
 */
import { useState } from "react";
import {
  Users,
  Plus,
  Copy,
  Check,
  LogIn,
  Trash2,
  Mail,
  ChevronDown,
} from "lucide-react";
import {
  useShoppingListGroups,
  useCreateShoppingListGroup,
  useJoinShoppingListGroup,
  useInviteToGroup,
  useDeleteShoppingListGroup,
} from "../hooks";
import ConfirmDialog from "./ConfirmDialog";
import type { ShowToast, ShoppingListGroup } from "../types";
import "./ShoppingListGroupSelector.css";

interface GroupWithMeta extends ShoppingListGroup {
  member_count?: number;
  user_role?: string;
}

interface Props {
  selectedGroupId: number | null;
  onSelectGroup: (groupId: number | null) => void;
  showToast: ShowToast;
}

const ShoppingListGroupSelector: React.FC<Props> = ({ selectedGroupId, onSelectGroup, showToast }) => {
  const [showCreateInput, setShowCreateInput] = useState<boolean>(false);
  const [showJoinInput, setShowJoinInput] = useState<boolean>(false);
  const [showInviteInput, setShowInviteInput] = useState<number | null>(null);
  const [newGroupName, setNewGroupName] = useState<string>("");
  const [inviteCode, setInviteCode] = useState<string>("");
  const [inviteEmail, setInviteEmail] = useState<string>("");
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [confirmDeleteGroupId, setConfirmDeleteGroupId] = useState<number | null>(null);

  const { data: groups = [] } = useShoppingListGroups() as { data: GroupWithMeta[] | undefined };
  const createMutation = useCreateShoppingListGroup();
  const joinMutation = useJoinShoppingListGroup();
  const inviteMutation = useInviteToGroup();
  const deleteMutation = useDeleteShoppingListGroup();

  const selectedGroup = (groups as GroupWithMeta[]).find((g) => g.id === selectedGroupId);

  // Create a new shared shopping list group
  const handleCreate = async () => {
    if (!newGroupName.trim()) return;
    try {
      await createMutation.mutateAsync(newGroupName.trim());
      setNewGroupName("");
      setShowCreateInput(false);
    } catch (error: unknown) {
      if (showToast) showToast((error as Error).message, "error");
    }
  };

  // Join an existing group using an invite code
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

  // Send an email invitation for a specific group
  const handleInvite = async (groupId: number) => {
    if (!inviteEmail.trim()) return;
    try {
      await inviteMutation.mutateAsync({ groupId, email: inviteEmail.trim() });
      setInviteEmail("");
      setShowInviteInput(null);
    } catch (error: unknown) {
      if (showToast) showToast((error as Error).message, "error");
    }
  };

  // Delete a group (owner-only); resets selection if the deleted group was active
  const handleDelete = async (groupId: number) => {
    try {
      await deleteMutation.mutateAsync(groupId);
      if (selectedGroupId === groupId) {
        onSelectGroup(null);
      }
    } catch (error: unknown) {
      if (showToast) showToast((error as Error).message, "error");
    }
    setConfirmDeleteGroupId(null);
  };

  // Copy invite code to clipboard with brief visual feedback
  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  return (
    <div className="group-selector">
      <div className="group-selector-toggle" onClick={() => setIsOpen(!isOpen)}>
        <div className="group-selector-label">
          <Users size={16} />
          <span>{selectedGroup ? selectedGroup.name : "My List"}</span>
          {selectedGroup && (
            <span className="group-member-count">
              {selectedGroup.member_count || 0} members
            </span>
          )}
        </div>
        <ChevronDown size={16} className={`chevron ${isOpen ? "open" : ""}`} />
      </div>

      {isOpen && (
        <div className="group-dropdown">
          {/* Personal list option */}
          <button
            className={`group-option ${!selectedGroupId ? "active" : ""}`}
            onClick={() => {
              onSelectGroup(null);
              setIsOpen(false);
            }}
          >
            <span>My List</span>
          </button>

          {/* Shared groups */}
          {(groups as GroupWithMeta[]).map((group) => (
            <div key={group.id} className="group-option-wrapper">
              <button
                className={`group-option ${selectedGroupId === group.id ? "active" : ""}`}
                onClick={() => {
                  onSelectGroup(group.id);
                  setIsOpen(false);
                }}
              >
                <div className="group-option-info">
                  <span>{group.name}</span>
                  <span className="group-meta">
                    {group.member_count || 0} members
                    {group.user_role === "owner" ? " \u00B7 Owner" : ""}
                  </span>
                </div>
              </button>
              {/* Show management actions only for the currently selected group */}
              {selectedGroupId === group.id && (
                <div className="group-actions">
                  <div className="invite-code-display">
                    <span className="code-label">Invite code:</span>
                    <code>{group.invite_code}</code>
                    <button
                      className="copy-btn"
                      onClick={() => handleCopyCode(group.invite_code!)}
                      title="Copy invite code"
                    >
                      {copiedCode === group.invite_code ? (
                        <Check size={14} />
                      ) : (
                        <Copy size={14} />
                      )}
                    </button>
                  </div>
                  {/* Owner-only actions: invite by email and delete */}
                  {group.user_role === "owner" && (
                    <>
                      <button
                        className="group-action-btn invite-btn"
                        onClick={() =>
                          setShowInviteInput(
                            showInviteInput === group.id ? null : group.id
                          )
                        }
                      >
                        <Mail size={14} />
                        <span>Invite</span>
                      </button>
                      {showInviteInput === group.id && (
                        <div className="inline-input">
                          <input
                            type="email"
                            value={inviteEmail}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setInviteEmail(e.target.value)}
                            placeholder="Email address"
                            onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) =>
                              e.key === "Enter" && handleInvite(group.id)
                            }
                          />
                          <button
                            onClick={() => handleInvite(group.id)}
                            disabled={inviteMutation.isPending}
                          >
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
                        <span>Delete</span>
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}

          {/* Create / Join buttons */}
          <div className="group-footer-actions">
            {!showCreateInput && !showJoinInput && (
              <>
                <button
                  className="group-footer-btn"
                  onClick={() => {
                    setShowCreateInput(true);
                    setShowJoinInput(false);
                  }}
                >
                  <Plus size={14} />
                  <span>Create List</span>
                </button>
                <button
                  className="group-footer-btn"
                  onClick={() => {
                    setShowJoinInput(true);
                    setShowCreateInput(false);
                  }}
                >
                  <LogIn size={14} />
                  <span>Join List</span>
                </button>
              </>
            )}

            {showCreateInput && (
              <div className="inline-input">
                <input
                  type="text"
                  value={newGroupName}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewGroupName(e.target.value)}
                  placeholder="List name"
                  autoFocus
                  onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                    if (e.key === "Enter") handleCreate();
                    if (e.key === "Escape") setShowCreateInput(false);
                  }}
                />
                <button
                  onClick={handleCreate}
                  disabled={createMutation.isPending}
                >
                  Create
                </button>
                <button
                  className="cancel-btn"
                  onClick={() => setShowCreateInput(false)}
                >
                  Cancel
                </button>
              </div>
            )}

            {showJoinInput && (
              <div className="inline-input">
                <input
                  type="text"
                  value={inviteCode}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setInviteCode(e.target.value)}
                  placeholder="Invite code"
                  autoFocus
                  onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                    if (e.key === "Enter") handleJoin();
                    if (e.key === "Escape") setShowJoinInput(false);
                  }}
                />
                <button
                  onClick={handleJoin}
                  disabled={joinMutation.isPending}
                >
                  Join
                </button>
                <button
                  className="cancel-btn"
                  onClick={() => setShowJoinInput(false)}
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      )}
      {confirmDeleteGroupId && (
        <ConfirmDialog
          message="Delete this shared list? All items will be removed."
          confirmLabel="Delete"
          onConfirm={() => handleDelete(confirmDeleteGroupId)}
          onCancel={() => setConfirmDeleteGroupId(null)}
        />
      )}
    </div>
  );
};

export default ShoppingListGroupSelector;
