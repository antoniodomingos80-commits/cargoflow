// =============================================================================
// Tipos de domínio da CargoFlow
// Espelham as enumerações e tabelas definidas em 04-MODELO-DE-DADOS.sql.
// Quando o projeto Supabase estiver criado, `npm run types:supabase` gera
// lib/database.types.ts a partir do esquema real — este ficheiro mantém-se
// como camada de domínio legível e independente.
// =============================================================================

export type UserRole =
  | 'MERCHANT'        // comerciante — publica cargas
  | 'CARRIER'         // camionista independente
  | 'COMPANY_ADMIN'   // gestor de empresa transportadora
  | 'COMPANY_STAFF'   // operacional de empresa
  | 'PLATFORM_ADMIN'; // administrador CargoFlow

export type VerificationStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED';

export type LoadStatus =
  | 'DRAFT' | 'PUBLISHED' | 'NEGOTIATING' | 'ASSIGNED' | 'PICKED_UP'
  | 'IN_TRANSIT' | 'DELIVERED' | 'CONFIRMED' | 'CANCELLED' | 'EXPIRED';

export type TripStatus =
  | 'PUBLISHED' | 'PARTIALLY_BOOKED' | 'FULL' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export type VehicleType =
  | 'LIGHT_TRUCK' | 'MEDIUM_TRUCK' | 'HEAVY_TRUCK' | 'TRAILER'
  | 'REFRIGERATED' | 'TANKER' | 'FLATBED' | 'CONTAINER';

export type CargoType =
  | 'GENERAL' | 'PERISHABLE' | 'REFRIGERATED' | 'FRAGILE'
  | 'HAZARDOUS' | 'BULK' | 'LIQUID' | 'CONTAINER' | 'LIVESTOCK';

export type OfferStatus =
  | 'PENDING' | 'COUNTERED' | 'ACCEPTED' | 'REJECTED' | 'WITHDRAWN' | 'EXPIRED';

export type DocumentType =
  | 'NATIONAL_ID' | 'DRIVING_LICENSE' | 'VEHICLE_REGISTRATION' | 'INSURANCE'
  | 'INSPECTION' | 'COMPANY_REGISTRATION' | 'TAX_ID' | 'OTHER';

// --- Rótulos em português (interface) ---------------------------------------

export const ROLE_LABELS: Record<UserRole, string> = {
  MERCHANT: 'Comerciante',
  CARRIER: 'Camionista',
  COMPANY_ADMIN: 'Empresa transportadora',
  COMPANY_STAFF: 'Operacional',
  PLATFORM_ADMIN: 'Administrador',
};

export const LOAD_STATUS_LABELS: Record<LoadStatus, string> = {
  DRAFT: 'Rascunho',
  PUBLISHED: 'Publicada',
  NEGOTIATING: 'Em negociação',
  ASSIGNED: 'Atribuída',
  PICKED_UP: 'Recolhida',
  IN_TRANSIT: 'Em trânsito',
  DELIVERED: 'Entregue',
  CONFIRMED: 'Confirmada',
  CANCELLED: 'Cancelada',
  EXPIRED: 'Expirada',
};

export const TRIP_STATUS_LABELS: Record<TripStatus, string> = {
  PUBLISHED: 'Publicada',
  PARTIALLY_BOOKED: 'Parcialmente ocupada',
  FULL: 'Lotada',
  IN_PROGRESS: 'Em curso',
  COMPLETED: 'Concluída',
  CANCELLED: 'Cancelada',
};

export const VEHICLE_TYPE_LABELS: Record<VehicleType, string> = {
  LIGHT_TRUCK: 'Camião ligeiro',
  MEDIUM_TRUCK: 'Camião médio',
  HEAVY_TRUCK: 'Camião pesado',
  TRAILER: 'Reboque',
  REFRIGERATED: 'Refrigerado',
  TANKER: 'Cisterna',
  FLATBED: 'Plataforma',
  CONTAINER: 'Porta-contentores',
};

export const CARGO_TYPE_LABELS: Record<CargoType, string> = {
  GENERAL: 'Carga geral',
  PERISHABLE: 'Perecível',
  REFRIGERATED: 'Refrigerada',
  FRAGILE: 'Frágil',
  HAZARDOUS: 'Perigosa',
  BULK: 'Granel',
  LIQUID: 'Líquida',
  CONTAINER: 'Contentor',
  LIVESTOCK: 'Animais vivos',
};

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  NATIONAL_ID: 'Bilhete de identidade',
  DRIVING_LICENSE: 'Carta de condução',
  VEHICLE_REGISTRATION: 'Livrete',
  INSURANCE: 'Seguro',
  INSPECTION: 'Inspeção',
  COMPANY_REGISTRATION: 'Certidão comercial',
  TAX_ID: 'NIF',
  OTHER: 'Outro',
};

/** Mapeia estado → classe CSS da etiqueta (ver globals.css) */
export const LOAD_STATUS_BADGE: Record<LoadStatus, string> = {
  DRAFT: 'cf-badge-idle',
  PUBLISHED: 'cf-badge-transit',
  NEGOTIATING: 'cf-badge-delayed',
  ASSIGNED: 'cf-badge-transit',
  PICKED_UP: 'cf-badge-transit',
  IN_TRANSIT: 'cf-badge-transit',
  DELIVERED: 'cf-badge-done',
  CONFIRMED: 'cf-badge-done',
  CANCELLED: 'cf-badge-idle',
  EXPIRED: 'cf-badge-idle',
};

// --- Entidades ---------------------------------------------------------------

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  tax_id: string | null;
  type: 'INDIVIDUAL' | 'COMPANY';
  country_code: string;
  default_currency: string;
  verification: VerificationStatus;
  is_active: boolean;
}

export interface AppUser {
  id: string;
  tenant_id: string;
  auth_user_id: string | null;
  email: string | null;
  phone: string | null;
  full_name: string;
  role: UserRole;
  avatar_url: string | null;
  verification: VerificationStatus;
  rating_average: number | null;
  rating_count: number;
  completion_rate: number | null;
  is_active: boolean;
}

/** Sessão resolvida no servidor — utilizador + empresa */
export interface SessionProfile {
  user: AppUser;
  tenant: Tenant;
}

export interface CFLocation {
  id: string;
  name: string;
  city: string;
  province: string;
  country_code: string;
  address: string | null;
}

export interface Load {
  id: string;
  tenant_id: string;
  reference: string;
  created_by: string;
  origin_id: string;
  destination_id: string;
  distance_km: number | null;
  title: string;
  description: string | null;
  cargo_type: CargoType;
  weight_kg: number;
  volume_m3: number | null;
  requires_refrigeration: boolean;
  required_vehicle_type: VehicleType | null;
  pickup_from: string;
  pickup_until: string;
  delivery_deadline: string | null;
  is_urgent: boolean;
  budget_amount: number | null;
  currency: string;
  suggested_price: number | null;
  status: LoadStatus;
  assigned_trip_id: string | null;
  published_at: string | null;
  created_at: string;
  // Relações carregadas por join
  origin?: CFLocation;
  destination?: CFLocation;
}

export interface Trip {
  id: string;
  tenant_id: string;
  reference: string;
  created_by: string;
  vehicle_id: string;
  driver_id: string | null;
  origin_id: string;
  destination_id: string;
  available_weight_kg: number;
  available_volume_m3: number | null;
  departure_at: string;
  estimated_arrival: string | null;
  price_per_kg: number | null;
  minimum_price: number | null;
  currency: string;
  status: TripStatus;
  is_return_trip: boolean;
  created_at: string;
  origin?: CFLocation;
  destination?: CFLocation;
}

export interface Vehicle {
  id: string;
  tenant_id: string;
  plate: string;
  type: VehicleType;
  brand: string | null;
  model: string | null;
  year: number | null;
  max_weight_kg: number;
  max_volume_m3: number | null;
  has_refrigeration: boolean;
  has_tail_lift: boolean;
  verification: VerificationStatus;
  is_active: boolean;
}

/** Resultado do motor de correspondência */
export interface Match {
  id: string;
  load_id: string;
  trip_id: string;
  score: number;
  score_breakdown: {
    geography: number;
    rating: number;
    history: number;
    dates: number;
    price: number;
    completion: number;
  };
  algorithm_version: string;
  notified_at: string | null;
  created_at: string;
}
