import { fetchPathaoTracking, mapPathaoStatusToOrderStatus } from './pathao.js';

export async function fetchCourierTracking(courier, trackingId) {
  switch (courier) {
    case 'pathao':
      return fetchPathaoTracking(trackingId);
    default:
      return {
        configured: false,
        courierStatus: null,
        events: [],
      };
  }
}

export function mapCourierStatusToOrderStatus(courier, courierStatus) {
  switch (courier) {
    case 'pathao':
      return mapPathaoStatusToOrderStatus(courierStatus);
    default:
      if (!courierStatus) return null;
      const key = String(courierStatus).toLowerCase();
      if (key.includes('deliver')) return 'delivered';
      if (key.includes('transit') || key.includes('ship') || key.includes('pickup')) {
        return 'shipped';
      }
      return null;
  }
}
