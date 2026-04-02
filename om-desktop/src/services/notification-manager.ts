import { Notification } from 'electron';

/**
 * NotificationManager - Handles system notifications for meetings
 */
export class NotificationManager {
  private currentNotification: Notification | null = null;

  /**
   * Show a system notification
   */
  showNotification(options: {
    title: string;
    body: string;
    silent?: boolean;
  }): void {
    // Close previous notification
    if (this.currentNotification) {
      this.currentNotification.close();
      this.currentNotification = null;
    }

    const notification = new Notification({
      title: options.title,
      body: options.body,
      silent: options.silent !== undefined ? options.silent : true,
    });

    // Clean up reference after notification is dismissed
    notification.once('close', () => {
      if (this.currentNotification === notification) {
        this.currentNotification = null;
      }
    });

    this.currentNotification = notification;
    this.currentNotification.show();
  }

  /**
   * Close current notification if any
   */
  closeCurrentNotification(): void {
    if (this.currentNotification) {
      this.currentNotification.close();
      this.currentNotification = null;
    }
  }
}
