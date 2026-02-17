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
import "./ShoppingListGroupSelector.css";

const ShoppingListGroupSelector = ({ selectedGroupId, onSelectGroup, showToast }) => {
  const [showCreateInput, setShowCreateInput] = useState(false);
  const [showJoinInput, setShowJoinInput] = useState(false);
  const [showInviteInput, setShowInviteInput] = useState(null);
  const [newGroupName, setNewGroupName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [copiedCode, setCopiedCode] = useState(null);
  const [isOpen, setIsOpen] = useState(false);
  const [confirmDeleteGroupId, setConfirmDeleteGroupId] = useState(null);

  const { data: groups = [] } = useShoppingListGroups();
  const createMutation = useCreateShoppingListGroup();
  const joinMutation = useJoinShoppingListGroup();
  const inviteMutation = useInviteToGroup();
  const deleteMutation = useDeleteShoppingListGroup();

  const selectedGroup = groups.find((g) => g.id === selectedGroupId);

  const handleCreate = async () => {
    if (!newGroupName.trim()) return;
    try {
      await createMutation.mutateAsync(newGroupName.trim());
      setNewGroupName("");
      setShowCreateInput(false);
    } catch (error) {
      if (showToast) showToast(error.message, "error");
    }
  };

  const handleJoin = async () => {
    if (!inviteCode.trim()) return;
    try {
      const result = await joinMutation.mutateAsync(inviteCode.trim());
      setInviteCode("");
      setShowJoinInput(false);
      if (result.group) {
        onSelectGroup(result.group.id);
      }
    } catch (error) {
      if (showToast) showToast(error.message, "error");
    }
  };

  const handleInvite = async (groupId) => {
    if (!inviteEmail.trim()) return;
    try {
      await inviteMutation.mutateAsync({ groupId, email: inviteEmail.trim() });
      setInviteEmail("");
      setShowInviteInput(null);
    } catch (error) {
      if (showToast) showToast(error.message, "error");
    }
  };

  const handleDelete = async (groupId) => {
    try {
      await deleteMutation.mutateAsync(groupId);
      if (selectedGroupId === groupId) {
        onSelectGroup(null);
      }
    } catch (error) {
      if (showToast) showToast(error.message, "error");
    }
    setConfirmDeleteGroupId(null);
  };

  const handleCopyCode = (code) => {
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
          {groups.map((group) => (
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
              {selectedGroupId === group.id && (
                <div className="group-actions">
                  <div className="invite-code-display">
                    <span className="code-label">Invite code:</span>
                    <code>{group.invite_code}</code>
                    <button
                      className="copy-btn"
                      onClick={() => handleCopyCode(group.invite_code)}
                      title="Copy invite code"
                    >
                      {copiedCode === group.invite_code ? (
                        <Check size={14} />
                      ) : (
                        <Copy size={14} />
                      )}
                    </button>
                  </div>
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
                            onChange={(e) => setInviteEmail(e.target.value)}
                            placeholder="Email address"
                            onKeyDown={(e) =>
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
                  onChange={(e) => setNewGroupName(e.target.value)}
                  placeholder="List name"
                  autoFocus
                  onKeyDown={(e) => {
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
                  onChange={(e) => setInviteCode(e.target.value)}
                  placeholder="Invite code"
                  autoFocus
                  onKeyDown={(e) => {
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
