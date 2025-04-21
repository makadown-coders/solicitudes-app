import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'nombreMes'
})
export class NombreMesPipe implements PipeTransform {

  /**
   * Transforma un número de mes (1-12) a su nombre en español
   * @param mes número de mes (1-12)
   * @returns nombre del mes en español (mayúsculas)
   */
  transform(mes: number): string {
    return new Date(2025, mes, 1)
      .toLocaleString('es-MX', { month: 'long' })
      .toUpperCase();
  }

}
