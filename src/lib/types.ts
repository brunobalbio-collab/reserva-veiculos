export type Role = 'user' | 'admin'

export interface Profile {
  id: string
  full_name: string
  email: string
  department: string | null
  phone: string | null
  role: Role
  active: boolean
  created_at: string
}

export interface Vehicle {
  id: string
  plate: string
  brand: string
  model: string
  color: string | null
  year: number | null
  seats: number | null
  location: string | null
  notes: string | null
  active: boolean
}

export type ReservationKind = 'reserva' | 'manutencao'
export type ReservationStatus = 'confirmada' | 'cancelada'

export interface Reservation {
  id: string
  vehicle_id: string
  user_id: string
  starts_at: string
  ends_at: string
  kind: ReservationKind
  status: ReservationStatus
  destination: string | null
  purpose: string | null
  passengers: number | null
  cancelled_at: string | null
  created_at: string
  vehicle?: Pick<Vehicle, 'plate' | 'brand' | 'model'>
  profile?: Pick<Profile, 'full_name' | 'email'>
}

export interface ScheduleItem {
  id: string
  starts_at: string
  ends_at: string
  kind: ReservationKind
  is_mine: boolean
  user_name: string | null
}

export interface Settings {
  max_duration_hours: number
  max_advance_days: number
  min_interval_minutes: number
}
