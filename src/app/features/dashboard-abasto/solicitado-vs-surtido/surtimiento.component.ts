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
  private filtrar(filas: Fila[]) {
    return filas.filter(f=>(f.municipio||'').toUpperCase().includes(this.municipio().trim().toUpperCase()) &&
      (f.nombre+' '+f.clues).toUpperCase().includes(this.unidad().trim().toUpperCase()) && (f.clave||'').includes(this.clave().trim()));
  }
  pedidosFiltrados=computed(()=>this.filtrar(this.informe()?.filas??[]));
  sinPedidoFiltradas=computed(()=>this.filtrar(this.informe()?.sinSolicitud??[]));
  filtradas=computed(()=>this.vista()?this.sinPedidoFiltradas():this.pedidosFiltrados());
  unidades=computed(()=>{
    const grupos=new Map<string, {nombre:string; municipio:string; clues:string; solicitadas:number; evaluables:number; cubiertas:number; parciales:number; sinSalida:number; cantidad:number; cubierta:number}>();
    // El detalle ya contiene una sola fila por CLUES y clave del periodo.
    for(const f of this.pedidosFiltrados()) {
      const u=grupos.get(f.clues)??{nombre:f.nombre,municipio:f.municipio,clues:f.clues,solicitadas:0,evaluables:0,cubiertas:0,parciales:0,sinSalida:0,cantidad:0,cubierta:0};
      grupos.set(f.clues,u);
      if(!f.clave || f.solicitado===null || f.solicitado<=0) continue;
      u.solicitadas++;
      if(f.tieneMovimiento===false) u.sinSalida++;
      if(f.cobertura===null) continue;
      u.evaluables++;
      u.cantidad+=f.solicitado;
      u.cubierta+=Math.min(Math.max(f.surtido,0),f.solicitado);
      if(f.surtido>=f.solicitado) u.cubiertas++;
      else if(f.surtido>0) u.parciales++;
    }
    return [...grupos.values()].map(u=>({...u,porClaves:u.evaluables?100*u.cubiertas/u.evaluables:null,
      porCantidad:u.cantidad?100*u.cubierta/u.cantidad:null}))
      .sort((a,b)=>(a.porClaves??Infinity)-(b.porClaves??Infinity)||a.nombre.localeCompare(b.nombre)||a.clues.localeCompare(b.clues));
  });
  sinEvaluar=computed(()=>this.unidades().reduce((n,u)=>n+u.solicitadas-u.evaluables,0));
  resumen=computed(()=>{
    const filas=this.pedidosFiltrados();
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
    for(const [nombre,filas] of [['Conciliación',this.pedidosFiltrados()],['Sin solicitud',this.sinPedidoFiltradas()]] as const){
      hoja(nombre,[['CLUES','Unidad','Municipio','CNIS','Descripción','Solicitado acumulado','Surtido registrado SAS','Pendiente','Excedente','Cobertura %','Surtido/solicitado %','Estado','IDs de solicitudes'],...filas.map(f=>[f.clues,f.nombre,f.municipio,f.clave,f.descripcion,f.solicitado,f.surtido,f.pendiente,f.excedente,f.cobertura,f.relacion,f.estado,f.solicitudIds.join(', ')])]);
    }
    hoja('Incidencias',[['Incidencia'],...r.incidencias.filter(i=>!i.startsWith('Destino por validar · ID ausente')).map(i=>[i])]);
    const unidades=this.unidades();
    const porcentaje=(v:number|null)=>v===null?'N/D':v/100;
    const encabezado=['Municipio','Unidad médica','CLUES','Claves solicitadas','Evaluables','Cubiertas','Parciales','Sin salida','% claves abastecidas','Cobertura por cantidad registrada'];
    hoja('COBERTURA_POR_UNIDAD',[encabezado,...unidades.map(u=>[u.municipio,u.nombre,u.clues,u.solicitadas,u.evaluables,u.cubiertas,u.parciales,u.sinSalida,porcentaje(u.porClaves),porcentaje(u.porCantidad)])]);
    const metodologia='SAS refleja salidas registradas. La recepción requiere confirmación de la unidad. La cobertura por cantidad suma unidades de insumos distintos y tiene alcance operativo.';
    const peores=unidades.filter(u=>u.porClaves!==null).slice(0,5);
    const contexto:unknown[][]=[['Periodo de solicitud',this.mes],['Fecha de corte',r.corte],['Municipio',this.municipio()||'Todos'],['Unidad',this.unidad()||'Todas'],['CNIS',this.clave()||'Todas'],['Unidades con solicitudes',unidades.length],['Metodología',metodologia],...r.ventanas.map(v=>[v.zona,v.desde,v.hasta]),['Unidades con menor cobertura (hasta cinco)',peores.map(u=>u.nombre+' ('+u.clues+')').join(', ')||'N/D']];
    hoja('RESUMEN_EJECUTIVO',[...contexto,['CLUES','Unidad médica','Claves evaluables','% claves abastecidas','Cobertura por cantidad registrada'],...unidades.map(u=>[u.clues,u.nombre,u.evaluables,porcentaje(u.porClaves),porcentaje(u.porCantidad)])]);
    for(const [nombre,inicio,columnas] of [['COBERTURA_POR_UNIDAD',1,[8,9]],['RESUMEN_EJECUTIVO',contexto.length+1,[3,4]]] as const){
      const sheet=libro.Sheets[nombre];
      unidades.forEach((_,i)=>columnas.forEach(c=>{
        const cell=sheet[x.utils.encode_cell({r:inicio+i,c})];
        if(cell?.t==='n') cell.z='0.0%';
      }));
      sheet['!cols']=(nombre==='COBERTURA_POR_UNIDAD'?[20,38,18,20,14,14,14,14,22,34]:[35,55,20,23,34]).map(wch=>({wch}));
    }
    x.writeFile(libro,'Surtimiento-Primer-Nivel-'+this.mes+'.xlsx');
  }
}
