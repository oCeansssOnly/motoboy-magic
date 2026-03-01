export interface IFoodOrder {
  id: string;
  displayId: string;
  localizador?: string;
  customerName: string;
  customerPhone: string;
  address: string;
  lat: number;
  lng: number;
  total: number;
  paymentMethod: string;
  items: string;
  status: string;
  createdAt: string;
  deliveryCode: string;
  raw?: any;
  // Local state
  selected?: boolean;
  confirmationCode?: string;
  confirmed?: boolean;
  confirmedLocally?: boolean;
}

export interface NoContactOrder {
  id: string;           // UUID PK in no_contact_orders
  order_id: string;     // iFood order ID
  order_data: IFoodOrder;
  marked_by: string;
  attempt_count: number;
  marked_at: string;
}


export interface CourierRoute {
  id: string;
  name: string;
  orders: IFoodOrder[];
  createdAt: string;
  /** GPS start point. Defaults to store when admin creates route.
   *  Updated to driver's current GPS position on order transfer. */
  startLat?: number;
  startLng?: number;
}

export function optimizeRoute(
  orders: IFoodOrder[],
  startLat: number,
  startLng: number
): IFoodOrder[] {
  if (orders.length <= 1) return [...orders];

  const remaining = [...orders];
  const ordered: IFoodOrder[] = [];
  let currentLat = startLat;
  let currentLng = startLng;

  while (remaining.length > 0) {
    let nearestIdx = 0;
    let nearestDist = Infinity;

    for (let i = 0; i < remaining.length; i++) {
      const d = haversine(currentLat, currentLng, remaining[i].lat, remaining[i].lng);
      if (d < nearestDist) {
        nearestDist = d;
        nearestIdx = i;
      }
    }

    const nearest = remaining.splice(nearestIdx, 1)[0];
    ordered.push(nearest);
    currentLat = nearest.lat;
    currentLng = nearest.lng;
  }

  return ordered;
}

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function generateGoogleMapsUrl(
  orders: IFoodOrder[],
  storeLat: number,
  storeLng: number,
  /** Override starting point (e.g. driver's GPS on transfer) */
  startLat?: number,
  startLng?: number,
): string {
  if (orders.length === 0) return '';

  const origin = `${startLat ?? storeLat},${startLng ?? storeLng}`;
  const storePoint = `${storeLat},${storeLng}`;
  const waypoints = orders.map((o) => `${o.lat},${o.lng}`);

  // origin → deliveries → store (always returns to store)
  return `https://www.google.com/maps/dir/${origin}/${waypoints.join('/')}/${storePoint}`;
}


export function getPaymentLabel(method: string): string {
  const labels: Record<string, string> = {
    ONLINE: '💳 Online',
    CASH: '💵 Dinheiro',
    PIX: '📱 PIX',
    CREDIT: '💳 Crédito',
    DEBIT: '💳 Débito',
    MEAL_VOUCHER: '🎫 Vale Refeição',
  };
  return labels[method] || method;
}
