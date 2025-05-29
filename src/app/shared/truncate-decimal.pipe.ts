import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'truncateDecimal',
  standalone: true,
})
export class TruncateDecimalPipe implements PipeTransform {
  transform(value: number, decimales: number = 1): number {
    const factor = Math.pow(10, decimales);
    return Math.floor(value * factor) / factor;
  }
}
