import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import AdminReservas from './AdminReservas'
import AdminVeiculos from './AdminVeiculos'
import AdminUsuarios from './AdminUsuarios'
import AdminConfig from './AdminConfig'

export default function Admin() {
  return (
    <div>
      <div className="subnav">
        <NavLink to="/admin/reservas">Reservas</NavLink>
        <NavLink to="/admin/veiculos">Veículos</NavLink>
        <NavLink to="/admin/usuarios">Usuários</NavLink>
        <NavLink to="/admin/config">Configurações</NavLink>
      </div>
      <Routes>
        <Route index element={<Navigate to="reservas" replace />} />
        <Route path="reservas" element={<AdminReservas />} />
        <Route path="veiculos" element={<AdminVeiculos />} />
        <Route path="usuarios" element={<AdminUsuarios />} />
        <Route path="config" element={<AdminConfig />} />
      </Routes>
    </div>
  )
}
