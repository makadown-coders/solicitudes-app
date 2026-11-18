import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Consulta, Fila, Informe, Ventana } from '../../../models/SurtimientoPrimerNivel';
import { SurtimientoPrimerNivelService } from '../../../services/surtimiento-primer-nivel.service';

@Component({standalone:true,imports:[CommonModule,FormsModule,RouterLink],templateUrl:'./surtimiento.component.html',styleUrl:'./surtimiento.component.css'})
export class SurtimientoComponent {
  private api=inject(SurtimientoPrimerNivelService);
  mes=new Intl.DateTimeFormat('en-CA',{year:'numeric',month:'2-digit',timeZone:'America/Tijuana'}).format(new Date());
  zona='';
  ventanas:Ventana[]=[];
  presentaciones=new Set<string>();
  informe=signal<Informe|null>(null);
  ocupado=signal(false);
  error=signal('');
  municipio=signal(''); unidad=signal(''); clave=signal('');
  pagina=signal(1);
  vista=signal(false);
  pendiente=signal(false);
  filtradas=computed(()=>{
    const r=this.informe(); if(!r)return [];
    return (this.vista()?r.sinSolicitud:r.filas).filter(f=>(f.municipio||'').toUpperCase().includes(this.municipio().trim().toUpperCase()) &&
      (f.nombre+' '+f.clues).toUpperCase().includes(this.unidad().trim().toUpperCase()) && (f.clave||'').includes(this.clave().trim()));
  });
  resumen=computed(()=>{
    const filas=this.informe()?.filas||[];
    const comparables=filas.filter(f=>f.cobertura!==null);
    const solicitado=comparables.reduce((n,f)=>n+(f.solicitado??0),0);
    const pendiente=comparables.reduce((n,f)=>n+(f.pendiente??0),0);
    return {lineas:comparables.length,solicitado,pendiente,cobertura:solicitado?100*(solicitado-pendiente)/solicitado:null};
  });
  constructor(){this.cambiarMes();}
  cambiarMes(){
    const [y,m]=this.mes.split('-').map(Number);
    this.ventanas=['AZM','AZT','AZE'].map(zona=>({zona,desde:this.mes+'-01',hasta:this.mes+'-'+new Date(Date.UTC(y,m,0)).getUTCDate()}));
    this.presentaciones.clear();this.informe.set(null);
  }
  editarVentana(){this.presentaciones.clear();this.pendiente.set(true);}
  marcar(set:Set<string>,id:string,checked:boolean){if(checked)set.add(id);else set.delete(id);this.pendiente.set(true);}
  idPresentacion(f:Fila){return JSON.stringify([f.clues,f.clave]);}
  async analizar(){
    if(this.ocupado()) return;
    this.ocupado.set(true);this.error.set('');
    const consulta:Consulta={mes:this.mes,ventanas:this.ventanas.filter(v=>!this.zona||v.zona===this.zona),
      presentaciones:[...this.presentaciones]};
    try {
      const r=await this.api.analizar(consulta);this.informe.set(r);
      this.pagina.set(1);this.pendiente.set(false);
    } catch(e:any){this.error.set(e.error?.error||'No se pudo obtener el análisis. Intente de nuevo.');this.pendiente.set(true);}
    finally{this.ocupado.set(false);}
  }
  async excel(){
    const r=this.informe();if(!r||this.pendiente())return;
    const x=await import('xlsx');const libro=x.utils.book_new();
    const hoja=(nombre:string,datos:unknown[][])=>x.utils.book_append_sheet(libro,x.utils.aoa_to_sheet(datos),nombre);
    hoja('Corte',[['Mes del pedido','Corte','Zona','ID almacén','Desde','Hasta'],...r.ventanas.map(v=>[this.mes,r.corte,v.zona,v.almacenId,v.desde,v.hasta])]);
    for(const [nombre,filas] of [['Conciliación',r.filas],['Sin solicitud',r.sinSolicitud]] as const){
      hoja(nombre,[['CLUES','Unidad','Municipio','CNIS','Descripción','Solicitado acumulado','Surtido registrado SAS','Pendiente','Excedente','Cobertura %','Surtido/solicitado %','Estado','IDs de solicitudes'],...filas.map(f=>[f.clues,f.nombre,f.municipio,f.clave,f.descripcion,f.solicitado,f.surtido,f.pendiente,f.excedente,f.cobertura,f.relacion,f.estado,f.solicitudIds.join(', ')])]);
    }
    hoja('Incidencias',[['Incidencia'],...r.incidencias.map(i=>[i])]);
    x.writeFile(libro,'Surtimiento-Primer-Nivel-'+this.mes+'.xlsx');
  }
}
