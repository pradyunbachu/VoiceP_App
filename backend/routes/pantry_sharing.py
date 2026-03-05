"""Pantry group collaboration routes.

Supports shared/group pantries with owner-managed membership:
  - Group CRUD (create, list, detail, delete)
  - Invite by email or join by invite code
  - Member removal (owner kicks member, or member leaves)

Roles: "owner" (full control) and "editor" (can add/edit items).
Ownership transfer is not supported — the owner must delete the group.
"""

# ============================================================================
# PANTRY SHARING ROUTES
# ============================================================================
from fastapi import APIRouter, HTTPException, Depends, Request
from datetime import datetime

from config import supabase
from auth import get_current_user_dependency
from rate_limit import limiter
from schemas import PantryGroupCreate, PantryGroupInvite, PantryGroupJoinByCode

router = APIRouter()


def verify_pantry_group_membership(user_id: str, group_id: int) -> bool:
    """Check if user is a member of the pantry group."""
    response = supabase.table("pantry_group_members").select("id").eq("group_id", group_id).eq("user_id", user_id).execute()
    return bool(response.data)


def verify_pantry_group_owner(user_id: str, group_id: int) -> bool:
    """Check if user is the owner of the pantry group."""
    response = supabase.table("pantry_groups").select("id").eq("id", group_id).eq("owner_id", user_id).execute()
    return bool(response.data)


@router.post("/pantry/groups")
@limiter.limit("10/minute")
async def create_pantry_group(
    request: Request,
    group_data: PantryGroupCreate,
    current_user: dict = Depends(get_current_user_dependency)
):
    """Create a new shared pantry group."""
    if supabase is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    user_id = current_user["id"]
    now = datetime.now().isoformat()

    # Create the group
    group_response = supabase.table("pantry_groups").insert({
        "name": group_data.name,
        "owner_id": user_id,
        "created_at": now,
        "updated_at": now
    }).execute()

    if not group_response.data:
        raise HTTPException(status_code=500, detail="Failed to create group")

    group = group_response.data[0]

    # Auto-add the creator as the "owner" member of the new group
    supabase.table("pantry_group_members").insert({
        "group_id": group["id"],
        "user_id": user_id,
        "role": "owner",
        "joined_at": now
    }).execute()

    return {"message": "Group created", **group}


@router.get("/pantry/groups")
@limiter.limit("30/minute")
async def list_pantry_groups(
    request: Request,
    current_user: dict = Depends(get_current_user_dependency)
):
    """List all pantry groups the user is a member of."""
    if supabase is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    user_id = current_user["id"]

    # Get all group IDs the user is a member of
    members_response = supabase.table("pantry_group_members").select("group_id, role").eq("user_id", user_id).execute()
    memberships = members_response.data if members_response.data else []

    if not memberships:
        return {"groups": [], "count": 0}

    group_ids = [m["group_id"] for m in memberships]
    role_map = {m["group_id"]: m["role"] for m in memberships}

    # Fetch group details
    groups_response = supabase.table("pantry_groups").select("*").in_("id", group_ids).execute()
    groups = groups_response.data if groups_response.data else []

    # Add member count and role to each group
    for group in groups:
        members_count_response = supabase.table("pantry_group_members").select("id", count="exact").eq("group_id", group["id"]).execute()
        group["member_count"] = members_count_response.count if members_count_response.count else 0
        group["user_role"] = role_map.get(group["id"], "editor")

    return {"groups": groups, "count": len(groups)}


@router.get("/pantry/groups/{group_id}")
@limiter.limit("30/minute")
async def get_pantry_group_detail(
    request: Request,
    group_id: int,
    current_user: dict = Depends(get_current_user_dependency)
):
    """Get pantry group details including members."""
    if supabase is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    user_id = current_user["id"]

    # Verify membership
    if not verify_pantry_group_membership(user_id, group_id):
        raise HTTPException(status_code=403, detail="Not a member of this group")

    # Get group
    group_response = supabase.table("pantry_groups").select("*").eq("id", group_id).execute()
    if not group_response.data:
        raise HTTPException(status_code=404, detail="Group not found")

    group = group_response.data[0]

    # Get members with user info
    members_response = supabase.table("pantry_group_members").select("*").eq("group_id", group_id).execute()
    members = members_response.data if members_response.data else []

    # Enrich each member record with display name and email from profiles table
    for member in members:
        try:
            profile_response = supabase.table("profiles").select("email, full_name").eq("id", member["user_id"]).execute()
            if profile_response.data:
                member["email"] = profile_response.data[0].get("email", "")
                member["name"] = profile_response.data[0].get("full_name", "")
        except:
            member["email"] = ""
            member["name"] = ""

    group["members"] = members
    group["is_owner"] = group["owner_id"] == user_id

    return group


@router.post("/pantry/groups/{group_id}/invite")
@limiter.limit("10/minute")
async def invite_to_pantry_group(
    request: Request,
    group_id: int,
    invite_data: PantryGroupInvite,
    current_user: dict = Depends(get_current_user_dependency)
):
    """Invite a user by email to join the pantry group (owner only)."""
    if supabase is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    user_id = current_user["id"]

    # Verify owner
    if not verify_pantry_group_owner(user_id, group_id):
        raise HTTPException(status_code=403, detail="Only the group owner can invite members")

    # Look up user by email in profiles table
    try:
        profile_response = supabase.table("profiles").select("id").eq("email", invite_data.email).execute()
        if not profile_response.data:
            raise HTTPException(status_code=404, detail="No user found with that email")

        invited_user_id = profile_response.data[0]["id"]
    except HTTPException:
        raise
    except:
        raise HTTPException(status_code=404, detail="No user found with that email")

    # Check if already a member
    if verify_pantry_group_membership(invited_user_id, group_id):
        raise HTTPException(status_code=400, detail="User is already a member of this group")

    # Add as member
    now = datetime.now().isoformat()
    supabase.table("pantry_group_members").insert({
        "group_id": group_id,
        "user_id": invited_user_id,
        "role": "editor",
        "joined_at": now
    }).execute()

    return {"message": "User invited to group successfully"}


@router.post("/pantry/groups/join")
@limiter.limit("10/minute")
async def join_pantry_group_by_code(
    request: Request,
    join_data: PantryGroupJoinByCode,
    current_user: dict = Depends(get_current_user_dependency)
):
    """Join a pantry group using an invite code."""
    if supabase is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    user_id = current_user["id"]

    # Find group by invite code
    group_response = supabase.table("pantry_groups").select("*").eq("invite_code", join_data.invite_code).execute()
    if not group_response.data:
        raise HTTPException(status_code=404, detail="Invalid invite code")

    group = group_response.data[0]

    # Check if already a member
    if verify_pantry_group_membership(user_id, group["id"]):
        raise HTTPException(status_code=400, detail="You are already a member of this group")

    # Join as editor
    now = datetime.now().isoformat()
    supabase.table("pantry_group_members").insert({
        "group_id": group["id"],
        "user_id": user_id,
        "role": "editor",
        "joined_at": now
    }).execute()

    return {"message": f"Joined group '{group['name']}'", "group": group}


@router.delete("/pantry/groups/{group_id}/members/{member_user_id}")
@limiter.limit("10/minute")
async def remove_pantry_member(
    request: Request,
    group_id: int,
    member_user_id: str,
    current_user: dict = Depends(get_current_user_dependency)
):
    """Remove a member from the pantry group (owner) or leave the group (self)."""
    if supabase is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    user_id = current_user["id"]
    is_owner = verify_pantry_group_owner(user_id, group_id)
    is_self = user_id == member_user_id

    if not is_owner and not is_self:
        raise HTTPException(status_code=403, detail="Only the group owner can remove members")

    # Prevent the owner from leaving — they must delete the group to dissolve it
    if is_self and is_owner:
        raise HTTPException(status_code=400, detail="Group owner cannot leave. Delete the group instead.")

    response = supabase.table("pantry_group_members").delete().eq("group_id", group_id).eq("user_id", member_user_id).execute()

    if not response.data:
        raise HTTPException(status_code=404, detail="Member not found")

    return {"message": "Member removed from group"}


@router.delete("/pantry/groups/{group_id}")
@limiter.limit("10/minute")
async def delete_pantry_group(
    request: Request,
    group_id: int,
    current_user: dict = Depends(get_current_user_dependency)
):
    """Delete a pantry group (owner only). Removes sharing — items are NOT deleted."""
    if supabase is None:
        raise HTTPException(status_code=500, detail="Database not configured")

    user_id = current_user["id"]

    if not verify_pantry_group_owner(user_id, group_id):
        raise HTTPException(status_code=403, detail="Only the group owner can delete the group")

    # Delete members (cascade from group delete handles this too, but be explicit)
    supabase.table("pantry_group_members").delete().eq("group_id", group_id).execute()

    # Delete group — items stay with the owner, they just stop being shared
    response = supabase.table("pantry_groups").delete().eq("id", group_id).execute()

    if not response.data:
        raise HTTPException(status_code=404, detail="Group not found")

    return {"message": "Group deleted"}
