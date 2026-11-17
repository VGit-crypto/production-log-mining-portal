import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../core/services/api.service';
import { BugStory } from '../models';

@Injectable({ providedIn: 'root' })
export class BugStoryService {
  private readonly api = inject(ApiService);

  getAll(clusterId?: string): Observable<BugStory[]> {
    return this.api.get<BugStory[]>('/bug-stories', { clusterId });
  }

  /** Asks the backend (Azure OpenAI) to write the bug story. `force` overwrites an existing one. */
  generate(clusterId: string, force = false): Observable<BugStory> {
    return this.api.post<BugStory>(`/clusters/${encodeURIComponent(clusterId)}/bug-story`, { force });
  }

  update(story: BugStory): Observable<BugStory> {
    return this.api.put<BugStory>(`/bug-stories/${encodeURIComponent(story.id)}`, story);
  }
}
