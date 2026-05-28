import { useEffect, useState } from "react";
import {
  collection,
  getDocs,
  query,
  where,
  doc,
  updateDoc,
  addDoc,
  limit,
} from "firebase/firestore";
import { db } from "./firebase";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { auth } from "./firebase";
import "./App.css";

function App() {
  const [usuario, setUsuario] = useState("");
  const [clave, setClave] = useState("");
  const [vendedor, setVendedor] = useState(null);
  const [plataformas, setPlataformas] = useState([]);
  const [historial, setHistorial] = useState([]);
  const [ventas, setVentas] = useState([]);
  const [entrega, setEntrega] = useState(null);
  const [plataformaCuenta, setPlataformaCuenta] = useState("");
const [correoCuenta, setCorreoCuenta] = useState("");
const [claveCuenta, setClaveCuenta] = useState("");
const [perfilCuenta, setPerfilCuenta] = useState("");
const [pinCuenta, setPinCuenta] = useState("");

const copiarCuenta = () => {
  if (!entrega) return;
  const texto = `
Correo: ${entrega.correo}
Contraseña: ${entrega.contraseña}
Perfil: ${entrega.perfil}
PIN: ${entrega.pin}
  `;

  navigator.clipboard.writeText(texto);

  alert("Cuenta copiada");
};
const agregarCuenta = async () => {

  if (
    !plataformaCuenta ||
    !correoCuenta ||
    !claveCuenta
  ) {
    return alert("Completa los campos");
  }

  await addDoc(
    collection(db, "plataformas", plataformaCuenta, "cuentas"),
    {
      correo: correoCuenta,
      contraseña: claveCuenta,
      perfil: perfilCuenta,
      pin: pinCuenta,
      disponible: true,
    }
  );

  alert("Cuenta agregada correctamente");

  setCorreoCuenta("");
  setClaveCuenta("");
  setPerfilCuenta("");
  setPinCuenta("");
};
  const [vendedores, setVendedores] = useState([]);
  const [vendedorSeleccionado, setVendedorSeleccionado] = useState("");
  const [montoRecarga, setMontoRecarga] = useState("");

  useEffect(() => {
    cargarPlataformas();
  }, []);

  const cargarPlataformas = async () => {
    const datos = await getDocs(collection(db, "plataformas"));
    setPlataformas(datos.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
  };

  const cargarVendedores = async () => {
    const datos = await getDocs(collection(db, "vendedores"));
    setVendedores(datos.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
  };

const iniciarSesion = async () => {
  try {
    const userCredential = await signInWithEmailAndPassword(
      auth,
      usuario,
      clave
    );

    const user = userCredential.user;

if (user.email === "jhonatansam4@gmail.com") {
  setVendedor({
    nombre: user.email,
    rol: "admin",
    id: user.uid,
    saldo: 0,
  });

  cargarVendedores();
} else {
  const q = query(
    collection(db, "vendedores"),
    where("usuario", "==", user.email)
  );

const datos = await getDocs(q);

if (datos.empty) {
  alert("Este vendedor no está registrado en Firestore");
  return;
}

const vendedorData = datos.docs[0].data();

setVendedor({
  nombre: vendedorData.nombre,
  rol: "vendedor",
  id: datos.docs[0].id,
  saldo: vendedorData.saldo || 0,
});
}
  } catch (error) {
    alert("Correo o contraseña incorrectos");
  }
};

  const recargarSaldo = async () => {
    if (!vendedorSeleccionado || !montoRecarga) {
      return alert("Selecciona vendedor y monto");
    }

    const monto = Number(montoRecarga);
    const vend = vendedores.find((v) => v.id === vendedorSeleccionado);

    const nuevoSaldo = Number(vend.saldo) + monto;

    await updateDoc(doc(db, "vendedores", vend.id), {
      saldo: nuevoSaldo,
    });
cargarVendedores();
alert("Saldo recargado correctamente");
    setMontoRecarga("");
  };

const comprar = async (plataforma) => {
  if (vendedor.saldo < plataforma.precio) {
    alert("Saldo insuficiente");
    return;
  }

  const q = query(
    collection(db, "plataformas", plataforma.id, "cuentas"),
    where("disponible", "==", true),
    limit(1)
  );

  const datos = await getDocs(q);

  if (datos.empty) {
    alert("No hay cuentas disponibles");
    return;
  }

  const cuentaDoc = datos.docs[0];
  const cuenta = cuentaDoc.data();
  const nuevoSaldo = vendedor.saldo - plataforma.precio;

  await updateDoc(doc(db, "vendedores", vendedor.id), {
    saldo: nuevoSaldo,
  });

  await updateDoc(
    doc(db, "plataformas", plataforma.id, "cuentas", cuentaDoc.id),
    {
      disponible: false,
      vendidoA: vendedor.nombre || vendedor.id,
    }
  );
await updateDoc(doc(db, "plataformas", plataforma.id), {
  stock: (plataforma.stock || 0) - 1,
});

await addDoc(collection(db, "ventas"), {
  vendedor: vendedor.nombre || vendedor.id,
  usuario: vendedor.usuario || vendedor.nombre,
    plataforma: plataforma.nombre,
    precio: plataforma.precio,
    correo: cuenta.correo,
    contraseña: cuenta.contraseña,
    perfil: cuenta.perfil,
    pin: cuenta.pin,
    fecha: new Date(),
  });

setVendedor({
  ...vendedor,
  saldo: nuevoSaldo,
});

setEntrega({
  correo: cuenta.correo,
  contraseña: cuenta.contraseña,
  perfil: cuenta.perfil,
  pin: cuenta.pin,
});

setHistorial([
`Compra: ${plataforma.nombre} - S/${plataforma.precio}`,
  ...historial,
]);

console.log("ENTREGA:", cuenta);
};
if (!vendedor) {
    return (
      <div className="panel">
        <h1>Fusion Cuentas</h1>
        <h2>Login</h2>

        <input placeholder="Usuario" value={usuario} onChange={(e) => setUsuario(e.target.value)} />
        <input placeholder="Clave" type="password" value={clave} onChange={(e) => setClave(e.target.value)} />

        <button onClick={iniciarSesion}>Ingresar</button>
      </div>
    );
  }

  if (vendedor.rol === "admin") {
    return (
      <div className="panel">
        <h1>Panel Administrador</h1>
        <div className="stats">

  <div className="stat-card">
    <h3>Vendedores</h3>
    <p>{vendedores.length}</p>
  </div>

  <div className="stat-card">
    <h3>Ventas</h3>
    <p>{ventas.length}</p>
  </div>

  <div className="stat-card">
    <h3>Plataformas</h3>
    <p>{plataformas.length}</p>
  </div>

</div>
        <p>Bienvenido, {vendedor.nombre}</p>

        <h2>Recargar saldo</h2>

        <select value={vendedorSeleccionado} onChange={(e) => setVendedorSeleccionado(e.target.value)}>
          <option value="">Seleccionar vendedor</option>
          {vendedores
            .filter((v) => v.rol === "vendedor")
            .map((v) => (
              <option key={v.id} value={v.id}>
                {v.nombre} - Saldo: S/{v.saldo}
              </option>
            ))}
        </select>

        <input
          placeholder="Monto"
          type="number"
          value={montoRecarga}
          onChange={(e) => setMontoRecarga(e.target.value)}
        />

        <button onClick={recargarSaldo}>Recargar</button>
<h2>Agregar cuenta</h2>

<select
  value={plataformaCuenta}
  onChange={(e) => setPlataformaCuenta(e.target.value)}
>
  <option value="">Seleccionar plataforma</option>

  {plataformas.map((p) => (
    <option key={p.id} value={p.id}>
      {p.nombre}
    </option>
  ))}
</select>

<input
  placeholder="Correo"
  value={correoCuenta}
  onChange={(e) => setCorreoCuenta(e.target.value)}
/>

<input
  placeholder="Contraseña"
  value={claveCuenta}
  onChange={(e) => setClaveCuenta(e.target.value)}
/>

<input
  placeholder="Perfil"
  value={perfilCuenta}
  onChange={(e) => setPerfilCuenta(e.target.value)}
/>

<input
  placeholder="PIN"
  value={pinCuenta}
  onChange={(e) => setPinCuenta(e.target.value)}
/>

<button onClick={agregarCuenta}>
Agregar cuenta
</button>

<br /><br />
<h2>Historial de Ventas</h2>

<div className="ventas">
  {ventas.map((venta) => (
    <div key={venta.id} className="card-venta">
      <p><b>Vendedor:</b> {venta.vendedor}</p>
      <p><b>Plataforma:</b> {venta.plataforma}</p>
      <p><b>Precio:</b> S/{venta.precio}</p>
      <p><b>Correo:</b> {venta.correo}</p>
      <p><b>Perfil:</b> {venta.perfil}</p>
    </div>
  ))}
</div>
        <br /><br />
        <button onClick={() => setVendedor(null)}>Cerrar sesión</button>
      </div>
    );
  }

return (
  <div className="panel">
    <h1>Fusion Cuentas</h1>
    <p>Bienvenido, {vendedor.nombre}</p>

    <h2>Saldo disponible</h2>
  <h3>S/{Number(vendedor.saldo || 0)}</h3>

    <h2>Plataformas</h2>

    {plataformas.map((p) => (
      <div key={p.id} className="card">
 <h3>{p.nombre}</h3>
<p>Precio: S/{p.precio}</p>
<p>Stock: {p.stock}</p>

<button
  onClick={() => comprar(p)}
  disabled={p.stock <= 0}
>
  {p.stock <= 0 ? "Sin stock" : "Comprar"}
</button>

      </div>
    ))}
<h2>Historial de Ventas</h2>

<div className="ventas">
  {ventas.map((venta) => (
    <div key={venta.id} className="card-venta">
      <p><b>Vendedor:</b> {venta.vendedor}</p>
      <p><b>Plataforma:</b> {venta.plataforma}</p>
      <p><b>Precio:</b> S/{venta.precio}</p>
      <p><b>Correo:</b> {venta.correo}</p>
      <p><b>Perfil:</b> {venta.perfil}</p>
    </div>
  ))}
</div>

{entrega && (
  <div className="card">
    <h2>Cuenta entregada</h2>

    <p>Correo: {entrega.correo}</p>
    <p>Contraseña: {entrega.contraseña}</p>
    <p>Perfil: {entrega.perfil}</p>
    <p>PIN: {entrega.pin}</p>

<button
  onClick={() => {
    navigator.clipboard.writeText(`
Correo: ${entrega.correo}
Contraseña: ${entrega.contraseña}
Perfil: ${entrega.perfil}
PIN: ${entrega.pin}
    `);

    alert("Cuenta copiada");
  }}
>
  Copiar cuenta
</button>
  </div>
)}

<h2>Historial</h2>

{historial.map((item, index) => (
  <p key={index}>{item}</p>
))}

<button onClick={() => setVendedor(null)}>
  Cerrar sesión
</button>

</div>

);
}
export default App;