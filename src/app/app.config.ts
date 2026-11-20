import { ApplicationConfig, ErrorHandler, provideBrowserGlobalErrorListeners, provideZoneChangeDetection } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter, withComponentInputBinding, withInMemoryScrolling } from '@angular/router';
import { provideNativeDateAdapter } from '@angular/material/core';
import { MAT_FORM_FIELD_DEFAULT_OPTIONS } from '@angular/material/form-field';
import { routes } from './app.routes';
import { mockApiInterceptor } from './core/mock/mock-api.interceptor';
import { apiInterceptor, errorInterceptor, loadingInterceptor } from './core/interceptors/interceptors';
import { GlobalErrorHandler } from './core/services/global-error-handler';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes, withComponentInputBinding(), withInMemoryScrolling({ scrollPositionRestoration: 'enabled' })),
    // Order matters: the mock short-circuits the chain, so it sits last (closest to the "network").
    provideHttpClient(withInterceptors([apiInterceptor, loadingInterceptor, errorInterceptor, mockApiInterceptor])),
    provideNativeDateAdapter(), // date pickers (Error Clusters filter)
    // Rounded outline fields with no reserved hint space: compact, modern filter panels and forms.
    { provide: MAT_FORM_FIELD_DEFAULT_OPTIONS, useValue: { appearance: 'outline', subscriptSizing: 'dynamic' } },
    { provide: ErrorHandler, useClass: GlobalErrorHandler },
  ],
};
