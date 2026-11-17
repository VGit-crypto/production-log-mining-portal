import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../core/services/api.service';
import { ErrorCluster, OccurrencePage, OccurrenceQuery } from '../models';

@Injectable({ providedIn: 'root' })
export class ErrorClusterService {
  private readonly api = inject(ApiService);

  getClusters(): Observable<ErrorCluster[]> {
    return this.api.get<ErrorCluster[]>('/clusters');
  }

  getCluster(id: string): Observable<ErrorCluster> {
    return this.api.get<ErrorCluster>(`/clusters/${encodeURIComponent(id)}`);
  }

  /** One page of the individual error log records behind a cluster's frequency (server-side filter/sort/paging). */
  getOccurrences(id: string, q: OccurrenceQuery): Observable<OccurrencePage> {
    return this.api.get<OccurrencePage>(`/clusters/${encodeURIComponent(id)}/occurrences`, {
      page: String(q.page),
      pageSize: String(q.pageSize),
      sort: q.sort,
      dir: q.dir,
      q: q.q || undefined,
    });
  }
}
