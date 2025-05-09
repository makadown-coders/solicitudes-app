// provider-count.pipe.ts
import { Pipe, PipeTransform } from '@angular/core';
import { Cita } from '../models/Cita';

@Pipe({ name: 'providerCount', standalone: true })
export class ProviderCountPipe implements PipeTransform {
  transform(citas: Cita[]): number {
    const set = new Set<string>();
    citas.forEach(c => {
      if (c.proveedor) set.add(c.proveedor);
    });
    return set.size;
  }
}
