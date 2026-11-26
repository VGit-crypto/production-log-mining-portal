import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../core/services/api.service';
import { DashboardMetrics } from '../models';

@Injectable({ providedIn: 'root' })
export class DashboardService {
  private readonly api = inject(ApiService);

  /** Deletes every stored upload, cluster, bug story and test case (the server keeps a backup copy). */
  clearAll(): Observable<{ cleared: boolean; backupFile: string | null }> {
    return this.api.delete('/data');
  }

  getMetrics(): Observable<DashboardMetrics> {
    return this.api.get<DashboardMetrics>('/dashboard/metrics');
  }
}
