import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../core/services/api.service';
import { DashboardMetrics } from '../models';

@Injectable({ providedIn: 'root' })
export class DashboardService {
  private readonly api = inject(ApiService);

  getMetrics(): Observable<DashboardMetrics> {
    return this.api.get<DashboardMetrics>('/dashboard/metrics');
  }
}
