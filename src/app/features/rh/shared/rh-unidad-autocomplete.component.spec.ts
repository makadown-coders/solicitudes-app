import { TestBed } from '@angular/core/testing';
import {
  RhUnidadAutocompleteComponent,
  RhUnidadSearchable,
} from './rh-unidad-autocomplete.component';

describe('RhUnidadAutocompleteComponent (RH-UX-UNIDADES-01)', () => {
  const sampleUnidades: RhUnidadSearchable[] = [
    { id: 177, nombre: 'OFICINA CENTRAL (COORDINACIÓN ESTATAL)', cluesimb: 'N/A', cluessa: null },
    { id: 10, nombre: 'HOSPITAL GENERAL TIJUANA', cluesimb: 'BCIMB00001', cluessa: 'BCSSA00099' },
    { id: 20, nombre: 'HOSPITAL GENERAL MEXICALI', cluesimb: 'BCIMB00002', cluessa: 'BCSSA00100' },
  ];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RhUnidadAutocompleteComponent],
    }).compileComponents();
  });

  it('filtra por nombre, CLUES IMB y CLUES SSA sin excluir OFICINA CENTRAL', () => {
    const fixture = TestBed.createComponent(RhUnidadAutocompleteComponent);
    const comp = fixture.componentInstance;
    comp.unidades = sampleUnidades;
    comp.ngOnChanges({ unidades: { currentValue: sampleUnidades, previousValue: [], firstChange: true, isFirstChange: () => true } });

    comp.onQueryChange('tijuana');
    expect(comp.filteredUnidades().map((u) => u.id)).toEqual([10]);

    comp.onQueryChange('BCIMB00002');
    expect(comp.filteredUnidades().map((u) => u.id)).toEqual([20]);

    comp.onQueryChange('BCSSA00099');
    expect(comp.filteredUnidades().map((u) => u.id)).toEqual([10]);

    comp.onQueryChange('oficina central');
    expect(comp.filteredUnidades().map((u) => u.id)).toEqual([177]);
  });

  it('permite selección con teclado (ArrowDown + Enter), Escape y opción Todas las unidades', () => {
    const fixture = TestBed.createComponent(RhUnidadAutocompleteComponent);
    const comp = fixture.componentInstance;
    comp.unidades = sampleUnidades;
    comp.allowAllOption = true;
    comp.ngOnChanges({ unidades: { currentValue: sampleUnidades, previousValue: [], firstChange: true, isFirstChange: () => true } });

    const emitted: Array<number | null> = [];
    comp.selectedIdChange.subscribe((v) => emitted.push(v));

    comp.openDropdown();
    expect(comp.isOpen()).toBeTrue();
    expect(comp.highlightedIndex()).toBe(-1); // Todas las unidades

    comp.onKeyDown(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    expect(comp.highlightedIndex()).toBe(0);

    comp.onKeyDown(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(emitted).toEqual([177]);
    expect(comp.isOpen()).toBeFalse();

    comp.openDropdown();
    comp.onKeyDown(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(comp.isOpen()).toBeFalse();
  });
});
