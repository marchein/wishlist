import { Component, inject } from '@angular/core';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { IonApp, IonRouterOutlet, NavController } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  add,
  addCircleOutline,
  alertCircle,
  arrowUndoOutline,
  cartOutline,
  checkmarkCircle,
  close,
  closeCircle,
  cloudUploadOutline,
  copyOutline,
  createOutline,
  ellipsisVertical,
  eyeOffOutline,
  eyeOutline,
  giftOutline,
  imageOutline,
  informationCircleOutline,
  languageOutline,
  linkOutline,
  logInOutline,
  logOutOutline,
  openOutline,
  refreshOutline,
  shareSocialOutline,
  sparklesOutline,
  star,
  starOutline,
  trashOutline,
  warningOutline,
} from 'ionicons/icons';
import { I18nService } from './core/i18n/i18n';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  imports: [IonApp, IonRouterOutlet],
})
export class AppComponent {
  private readonly nav = inject(NavController);

  constructor() {
    // Instantiated eagerly so <html lang> and the document title follow the language from the start.
    inject(I18nService);
    if (Capacitor.isNativePlatform()) {
      // Universal Links: https://wishlist.hein.cx/s/<token> tapped in e.g. WhatsApp opens the app here.
      void App.addListener('appUrlOpen', ({ url }) => {
        const path = new URL(url).pathname;
        if (path.startsWith('/s/')) void this.nav.navigateForward(path);
      });
    }
    addIcons({
      add,
      addCircleOutline,
      alertCircle,
      arrowUndoOutline,
      cartOutline,
      checkmarkCircle,
      close,
      closeCircle,
      cloudUploadOutline,
      copyOutline,
      createOutline,
      ellipsisVertical,
      eyeOffOutline,
      eyeOutline,
      giftOutline,
      imageOutline,
      informationCircleOutline,
      languageOutline,
      linkOutline,
      logInOutline,
      logOutOutline,
      openOutline,
      refreshOutline,
      shareSocialOutline,
      sparklesOutline,
      star,
      starOutline,
      trashOutline,
      warningOutline,
    });
  }
}
