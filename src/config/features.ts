/**
 * Switches for parts of the staff dashboard.
 *
 * Turning something off only HIDES it: the pages, data and code all stay, and
 * flipping the switch back to true brings everything back exactly as it was.
 */
export const features = {
  /**
   * Online orders: the Orders page in the sidebar, the order numbers on the
   * dashboard, room-service counts, and the pickup-time / class-hours /
   * ordering-rules sections in Settings. (/admin/orders still works if you
   * type the address.)
   */
  orders: false,
} as const;
