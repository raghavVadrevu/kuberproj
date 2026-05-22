from uuid import UUID

from pydantic import BaseModel, Field


class UserProfileOut(BaseModel):
    sub: str
    email: str | None = None
    display_name: str


class MePut(BaseModel):
    display_name: str | None = Field(default=None, max_length=200)


class FriendRequestCreate(BaseModel):
    email: str = Field(min_length=3, max_length=320)


class FriendRequestOut(BaseModel):
    id: UUID
    from_sub: str
    to_sub: str
    status: str
    created_at: str
    from_display_name: str | None = None
    from_email: str | None = None
    to_display_name: str | None = None
    to_email: str | None = None


class FriendRequestCreateResult(BaseModel):
    """When the other person already sent you a request, you match and become friends immediately."""

    became_friends: bool = False
    request: FriendRequestOut | None = None


class GroupCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)


class GroupMemberOut(BaseModel):
    user_sub: str
    role: str
    joined_at: str
    display_name: str | None = None
    email: str | None = None


class GroupOut(BaseModel):
    id: UUID
    name: str
    created_by: str
    created_at: str
    member_count: int = 0


class GroupDetailOut(GroupOut):
    members: list[GroupMemberOut] = Field(default_factory=list)


class GroupMemberAdd(BaseModel):
    email: str = Field(min_length=3, max_length=320)


class PollCreate(BaseModel):
    title: str = Field(min_length=1, max_length=500)
    options: list[str] = Field(min_length=2, max_length=20)


class PollOptionOut(BaseModel):
    id: UUID
    label: str
    sort_order: int
    first_choice_votes: int = 0


class PollOut(BaseModel):
    id: UUID
    group_id: UUID
    title: str
    status: str
    created_by: str
    created_at: str
    options: list[PollOptionOut]
    vote_count: int
    my_ranking: list[UUID] | None = None


class VoteIn(BaseModel):
    ranked_option_ids: list[UUID] = Field(min_length=1)


class AvailabilitySlot(BaseModel):
    day: str
    slot: str


class AvailabilityPut(BaseModel):
    slots: list[AvailabilitySlot] = Field(default_factory=list)


class HeatmapCell(BaseModel):
    count: int
    members: list[str] = Field(default_factory=list)


class AvailabilityOut(BaseModel):
    heatmap: dict[str, dict[str, HeatmapCell]]
    mine: list[str]


class ExpenseCreate(BaseModel):
    description: str = Field(min_length=1, max_length=500)
    amount: float = Field(gt=0, le=1_000_000)
    category: str = Field(default="other", max_length=40)
    split_all: bool = True
    participant_subs: list[str] = Field(default_factory=list)
    paid_by_sub: str | None = None


class ExpenseOut(BaseModel):
    id: UUID
    group_id: UUID
    description: str
    amount: float
    category: str
    paid_by_sub: str
    paid_by_display_name: str | None = None
    participant_subs: list[str]
    participant_count: int
    share_amount: float
    settled: bool
    created_at: str


class TabBalanceRow(BaseModel):
    user_sub: str
    display_name: str | None = None
    net: float


class TabMemberLite(BaseModel):
    user_sub: str
    display_name: str | None = None


class TabOverviewOut(BaseModel):
    viewer_sub: str
    my_net: float
    balances: list[TabBalanceRow]
    expenses: list[ExpenseOut]
    members: list[TabMemberLite]


class VaultItemCreate(BaseModel):
    item_type: str = Field(min_length=1, max_length=20)
    title: str = Field(min_length=1, max_length=500)
    subtitle: str | None = Field(default=None, max_length=500)
    value: str = Field(min_length=1, max_length=4000)
    category: str = Field(min_length=1, max_length=100)


class VaultItemUpdate(BaseModel):
    item_type: str | None = Field(default=None, max_length=20)
    title: str | None = Field(default=None, min_length=1, max_length=500)
    subtitle: str | None = Field(default=None, max_length=500)
    value: str | None = Field(default=None, min_length=1, max_length=4000)
    category: str | None = Field(default=None, min_length=1, max_length=100)


class VaultItemOut(BaseModel):
    id: UUID
    group_id: UUID
    item_type: str
    title: str
    subtitle: str | None
    value: str
    category: str
    created_by: str
    created_at: str
    updated_at: str


class ChatMessageOut(BaseModel):
    id: UUID
    group_id: UUID
    sender_sub: str
    sender_display_name: str | None = None
    content: str
    created_at: str
    is_ai: bool = False
