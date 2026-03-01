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

export interface CourierRoute {
  id: string;
  name: string;
  orders: IFoodOrder[];
  createdAt: string;
}

export function optimizeRoute(
  orders: IFoodOrder[],
  storeLat: number,
  storeLng: number
): IFoodOrder[] {
  if (orders.length <= 1) return [...orders];

  const remaining = [...orders];
  const ordered: IFoodOrder[] = [];
  let currentLat = storeLat;
  let currentLng = storeLng;

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
  storeLng: number
): string {
  if (orders.length === 0) return '';

  const storePoint = `${storeLat},${storeLng}`;
  const waypoints = orders.map((o) => `${o.lat},${o.lng}`);

  // Store -> orders -> Store
  return `https://www.google.com/maps/dir/${storePoint}/${waypoints.join('/')}/${storePoint}`;
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
