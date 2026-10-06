(()=>{
  // GREÑA Web: cerrar una pestaña no apaga el servicio en la nube.
  const beat=()=>fetch('/api/app/window-heartbeat',{method:'POST',headers:{'content-type':'application/json'},body:'{}',keepalive:true}).catch(()=>{});
  beat();setInterval(beat,12000);
})();
