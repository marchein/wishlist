import { Component, inject } from '@angular/core';
import { IonApp, IonRouterOutlet } from '@ionic/angular';
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
  constructor() {
    // Instantiated eagerly so <html lang> and the document title follow the language from the start.
    inject(I18nService);
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
