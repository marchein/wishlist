import { Component, computed, inject, input, signal } from '@angular/core';
import {
  ActionSheetController,
  AlertController,
  IonBackButton,
  IonButton,
  IonButtons,
  IonCard,
  IonCardContent,
  IonContent,
  IonFab,
  IonFabButton,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonNote,
  IonSpinner,
  IonThumbnail,
  IonTitle,
  IonToolbar,
  ModalController,
  NavController,
  type ViewWillEnter,
} from '@ionic/angular';
import { ItemEditorComponent } from '../../components/item-editor/item-editor.component';
import { PriorityStarsComponent } from '../../components/priority-stars.component';
import { ApiService } from '../../core/api.service';
import { I18nService, LocalDatePipe, PricePipe, TranslatePipe } from '../../core/i18n/i18n';
import type { Item, WishlistWithItems } from '../../core/models';
import { AssetUrlPipe, NotifyService } from '../../core/ui';

/** The owner's view of one wishlist. Intentionally shows nothing about purchases. */
@Component({
  selector: 'app-wishlist-detail',
  templateUrl: 'wishlist-detail.page.html',
  styleUrls: ['wishlist-detail.page.scss'],
  imports: [
    LocalDatePipe,
    TranslatePipe,
    AssetUrlPipe,
    PricePipe,
    PriorityStarsComponent,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonBackButton,
    IonTitle,
    IonButton,
    IonIcon,
    IonContent,
    IonCard,
    IonCardContent,
    IonList,
    IonItem,
    IonThumbnail,
    IonLabel,
    IonNote,
    IonSpinner,
    IonFab,
    IonFabButton,
  ],
})
export class WishlistDetailPage implements ViewWillEnter {
  private readonly api = inject(ApiService);
  private readonly modals = inject(ModalController);
  private readonly alerts = inject(AlertController);
  private readonly actionSheets = inject(ActionSheetController);
  private readonly nav = inject(NavController);
  private readonly notify = inject(NotifyService);
  private readonly i18n = inject(I18nService);

  /** Bound from the :id route parameter. */
  readonly id = input.required<string>();
  readonly wishlist = signal<WishlistWithItems | null>(null);
  readonly shareUrl = computed(() => {
    const wishlist = this.wishlist();
    return wishlist ? `${window.location.origin}/s/${wishlist.shareToken}` : '';
  });

  ionViewWillEnter(): void {
    void this.load();
  }

  async load(): Promise<void> {
    try {
      this.wishlist.set(await this.api.getWishlist(this.id()));
    } catch (error) {
      await this.notify.error(error);
      await this.nav.navigateBack('/wishlists');
    }
  }

  async openEditor(item?: Item): Promise<void> {
    const modal = await this.modals.create({
      component: ItemEditorComponent,
      componentProps: { wishlistId: this.id(), item },
    });
    await modal.present();
    const { role } = await modal.onWillDismiss();
    if (role === 'saved' || role === 'deleted') await this.load();
  }

  async share(): Promise<void> {
    const wishlist = this.wishlist();
    if (!wishlist) return;
    const url = this.shareUrl();
    if (navigator.share) {
      try {
        await navigator.share({ title: wishlist.title, text: this.i18n.t('detail.shareText', { title: wishlist.title }), url });
        return;
      } catch (error) {
        if ((error as Error).name === 'AbortError') return;
      }
    }
    await this.copyLink();
  }

  async copyLink(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.shareUrl());
      await this.notify.success(this.i18n.t('detail.linkCopied'));
    } catch {
      await this.notify.error(this.i18n.t('detail.copyFailed'));
    }
  }

  async openMenu(): Promise<void> {
    const t = this.i18n.t.bind(this.i18n);
    const sheet = await this.actionSheets.create({
      buttons: [
        { text: t('detail.menu.edit'), icon: 'create-outline', data: 'edit' },
        { text: t('detail.menu.preview'), icon: 'open-outline', data: 'preview' },
        { text: t('detail.menu.regenerate'), icon: 'refresh-outline', data: 'regenerate' },
        { text: t('detail.menu.delete'), icon: 'trash-outline', role: 'destructive', data: 'delete' },
        { text: t('common.cancel'), role: 'cancel' },
      ],
    });
    await sheet.present();
    const { data } = await sheet.onDidDismiss<string>();
    if (data === 'edit') await this.editDetails();
    if (data === 'preview') await this.nav.navigateForward(['/s', this.wishlist()!.shareToken]);
    if (data === 'regenerate') await this.regenerateLink();
    if (data === 'delete') await this.deleteList();
  }

  private async editDetails(): Promise<void> {
    const wishlist = this.wishlist()!;
    const t = this.i18n.t.bind(this.i18n);
    const alert = await this.alerts.create({
      header: t('detail.edit.header'),
      inputs: [
        { name: 'title', value: wishlist.title, placeholder: t('detail.edit.title'), attributes: { maxlength: 120 } },
        {
          name: 'description',
          type: 'textarea',
          value: wishlist.description ?? '',
          placeholder: t('detail.edit.description'),
        },
        { name: 'eventDate', type: 'date', value: wishlist.eventDate ?? '' },
      ],
      buttons: [
        { text: t('common.cancel'), role: 'cancel' },
        { text: t('common.save'), role: 'confirm' },
      ],
    });
    await alert.present();
    const { role, data } = await alert.onDidDismiss<{ values: { title: string; description: string; eventDate: string } }>();
    if (role !== 'confirm' || !data?.values.title.trim()) return;
    try {
      await this.api.updateWishlist(wishlist.id, {
        title: data.values.title.trim(),
        description: data.values.description.trim() || null,
        eventDate: data.values.eventDate || null,
      });
      await this.load();
    } catch (error) {
      await this.notify.error(error);
    }
  }

  private async regenerateLink(): Promise<void> {
    const alert = await this.alerts.create({
      header: this.i18n.t('detail.regenerate.header'),
      message: this.i18n.t('detail.regenerate.message'),
      buttons: [
        { text: this.i18n.t('common.cancel'), role: 'cancel' },
        { text: this.i18n.t('detail.regenerate.confirm'), role: 'confirm' },
      ],
    });
    await alert.present();
    if ((await alert.onDidDismiss()).role !== 'confirm') return;
    try {
      await this.api.regenerateShareToken(this.id());
      await this.load();
      await this.notify.success(this.i18n.t('detail.regenerate.done'));
    } catch (error) {
      await this.notify.error(error);
    }
  }

  private async deleteList(): Promise<void> {
    const alert = await this.alerts.create({
      header: this.i18n.t('detail.delete.header'),
      message: this.i18n.t('detail.delete.message'),
      buttons: [
        { text: this.i18n.t('common.cancel'), role: 'cancel' },
        { text: this.i18n.t('common.delete'), role: 'destructive' },
      ],
    });
    await alert.present();
    if ((await alert.onDidDismiss()).role !== 'destructive') return;
    try {
      await this.api.deleteWishlist(this.id());
      await this.nav.navigateRoot('/wishlists');
    } catch (error) {
      await this.notify.error(error);
    }
  }
}
