import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CapturaCluesComponent } from './captura-clues.component';

describe('CapturaCluesComponent', () => {
  let component: CapturaCluesComponent;
  let fixture: ComponentFixture<CapturaCluesComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CapturaCluesComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CapturaCluesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
