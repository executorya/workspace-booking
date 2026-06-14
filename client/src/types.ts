export type Role = "USER" | "ADMIN";
export type WorkspaceType = "DESK" | "MEETING_ROOM" | "CONFERENCE_ROOM";
export type BookingStatus = "PENDING" | "CONFIRMED" | "CANCELLED";

export type User = {
  id: number;
  name: string;
  email: string;
  role: Role;
};

export type LayoutSpot = {
  id: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  type?: "desk" | "room" | "soft" | "focus";
};

export type LayoutZone = {
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
};

export type WorkspaceLayout = {
  width: number;
  height: number;
  spots: LayoutSpot[];
  zones: LayoutZone[];
};

export type Workspace = {
  id: number;
  title: string;
  description: string;
  type: WorkspaceType;
  capacity: number;
  pricePerHour: number;
  location: string;
  imageUrl: string;
  amenities: string[];
  layout: WorkspaceLayout;
  isActive: boolean;
  bookings?: Booking[];
};

export type Booking = {
  id: number;
  userId: number;
  workspaceId: number;
  seatLabel?: string | null;
  startTime: string;
  endTime: string;
  status: BookingStatus;
  user?: User;
  workspace: Workspace;
};
