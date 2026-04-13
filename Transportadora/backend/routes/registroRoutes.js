const express = require('express');
const router = express.Router();
const pool = require('../models/database');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const generarToken = (userId) => {
    return jwt.sign(
        { 
            id_usuario: userId,
            timestamp: Date.now()
        },
        process.env.JWT_SECRET || 'fallback_secret',
        { expiresIn: '24h' }
    );
};
router.get('/empresas-activas', async (req, res) => {
    try {
        console.log('📋 Obteniendo lista de empresas activas...');
        
        const [empresas] = await pool.execute(`
            SELECT empresa_id, nombre_empresa, ruc 
            FROM empresas 
            ORDER BY nombre_empresa ASC
        `);

        console.log(`✅ ${empresas.length} empresas encontradas`);

        res.json({
            success: true,
            empresas: empresas
        });

    } catch (error) {
        console.error('Error obteniendo empresas:', error);
        res.status(500).json({
            success: false,
            message: 'Error al obtener la lista de empresas'
        });
    }
});

router.post('/registro-admin', async (req, res) => {
    const { 
        nombre,
        correo, 
        contraseña,
        telefono,
        empresa_id
    } = req.body;

    console.log('👨‍💼 Registro administrador:', { nombre, correo, empresa_id });

    if (!nombre || !correo || !contraseña || !empresa_id) {
        return res.status(400).json({ 
            success: false, 
            message: 'Nombre, correo, contraseña y empresa son requeridos' 
        });
    }

    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();
        const [adminExistente] = await connection.execute(
            'SELECT id_usuario FROM usuarios WHERE empresa_id = ? AND id_rol = 1',
            [empresa_id]
        );

        if (adminExistente.length > 0) {
            await connection.rollback();
            return res.status(400).json({
                success: false,
                message: 'Ya existe un administrador registrado para esta empresa. Solo se permite un administrador por empresa.'
            });
        }
       const [empresaCheck] = await connection.execute(
    'SELECT empresa_id, nombre_empresa FROM empresas WHERE empresa_id = ?',
    [empresa_id]
);

        if (empresaCheck.length === 0) {
            await connection.rollback();
            return res.status(400).json({
                success: false,
                message: 'La empresa seleccionada no existe'
            });
        }
        const [usuariosExistentes] = await connection.execute(
            'SELECT id_usuario FROM usuarios WHERE correo = ?',
            [correo]
        );

        if (usuariosExistentes.length > 0) {
            await connection.rollback();
            return res.status(400).json({
                success: false,
                message: 'El correo electrónico ya está registrado'
            });
        }
        const hashedPassword = await bcrypt.hash(contraseña, 10);

        const [usuarioResult] = await connection.execute(
            'INSERT INTO usuarios (correo, contraseña, id_rol, activo, empresa_id) VALUES (?, ?, ?, ?, ?)',
            [correo, hashedPassword, 1, 1, empresa_id]
        );

        const usuarioId = usuarioResult.insertId;
        await connection.commit();

        console.log('Registro admin exitoso - Usuario ID:', usuarioId, 'Empresa ID:', empresa_id);

        res.json({
            success: true,
            message: `Administrador registrado exitosamente en ${empresaCheck[0].nombre_empresa}`,
            data: {
                id_usuario: usuarioId,
                nombre: nombre,
                correo: correo,
                empresa_id: empresa_id
            }
        });

    } catch (error) {
        if (connection) await connection.rollback();
        console.error('Error en registro administrador:', error);
        res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    } finally {
        if (connection) connection.release();
    }
});

router.post('/registro-transportista', async (req, res) => {
    const { 
        nombre, 
        correo, 
        telefono, 
        cedula, 
        licencia, 
        vehiculo, 
        peso_maximo, 
        contraseña,
        empresa_id
    } = req.body;

    console.log('📝 Datos recibidos para registro transportista:', { 
        nombre, correo, empresa_id 
    });

    if (!nombre || !correo || !contraseña || !cedula || !licencia || !vehiculo || !empresa_id) {
        return res.status(400).json({ 
            success: false, 
            message: 'Faltan campos obligatorios: nombre, correo, contraseña, cédula, licencia, vehículo y empresa son requeridos' 
        });
    }

    try {
        const [empresaCheck] = await pool.execute(
            'SELECT empresa_id, nombre_empresa FROM empresas WHERE empresa_id = ?',
            [empresa_id]
        );

        if (empresaCheck.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'La empresa seleccionada no existe'
            });
        }
    } catch (error) {
        console.error('Error validando empresa:', error);
        return res.status(500).json({
            success: false,
            message: 'Error al validar la empresa'
        });
    }

    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();
        const [usuariosExistentes] = await connection.execute(
            'SELECT id_usuario FROM usuarios WHERE correo = ?',
            [correo]
        );

        if (usuariosExistentes.length > 0) {
            await connection.rollback();
            return res.status(400).json({
                success: false,
                message: 'El correo electrónico ya está registrado'
            });
        }

        const hashedPassword = await bcrypt.hash(contraseña, 10);

        const [usuarioResult] = await connection.execute(
            'INSERT INTO usuarios (correo, contraseña, id_rol, activo, empresa_id) VALUES (?, ?, ?, ?, ?)',
            [correo, hashedPassword, 2, 1, empresa_id]
        );

        const usuarioId = usuarioResult.insertId;

        const [transportistaResult] = await connection.execute(
            `INSERT INTO transportistas 
             (nombre, telefono, id_usuario, cedula, licencia, vehiculo, peso_maximo, estado, empresa_id) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                nombre, 
                telefono || '', 
                usuarioId, 
                cedula, 
                licencia, 
                vehiculo, 
                peso_maximo || '1000', 
                'Libre',
                empresa_id
            ]
        );

        const transportistaId = transportistaResult.insertId;

        await connection.commit();

        console.log('✅ Registro exitoso - Usuario ID:', usuarioId, 'Transportista ID:', transportistaId, 'Empresa ID:', empresa_id);

        res.json({
            success: true,
            message: `Transportista registrado exitosamente`,
            user: {
                id: usuarioId,
                id_transportista: transportistaId,
                nombre: nombre,
                correo: correo,
                empresa_id: empresa_id
            }
        });

    } catch (error) {
        if (connection) await connection.rollback();
        console.error('Error en registro transportista:', error);
        
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({
                success: false,
                message: 'La cédula o licencia ya están registradas'
            });
        }

        res.status(500).json({
            success: false,
            message: 'Error interno del servidor: ' + error.message
        });
    } finally {
        if (connection) connection.release();
    }
});
router.post('/registro-cliente', async (req, res) => {
  const { email, cedula, telefono, contraseña, password } = req.body;

  try {
    console.log('👤 Registro cliente recibido:', { email, cedula });
    
    if (!email || !cedula || !telefono || (!contraseña && !password)) {
      return res.status(400).json({
        success: false,
        message: 'Todos los campos son obligatorios'
      });
    }
    
    const passwordFinal = contraseña || password;
    
    if (!passwordFinal) {
      return res.status(400).json({
        success: false,
        message: 'La contraseña es requerida'
      });
    }
    
    const [clientesExistentes] = await pool.execute(
      `SELECT c.*, u.correo 
       FROM clientes c 
       JOIN usuarios u ON c.id_usuario = u.id_usuario 
       WHERE c.cedula = ? OR u.correo = ?`,
      [cedula, email]
    );

    if (clientesExistentes.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Ya existe un cliente registrado con esa cédula o correo electrónico'
      });
    }
    
    const hashedPassword = await bcrypt.hash(passwordFinal, 10);

    const [usuarioResult] = await pool.execute(
      'INSERT INTO usuarios (correo, contraseña, id_rol) VALUES (?, ?, ?)',
      [email, hashedPassword, 3]
    );

    const usuarioId = usuarioResult.insertId;
    const [clienteResult] = await pool.execute(
      `INSERT INTO clientes (cedula, id_usuario, telefono) 
       VALUES (?, ?, ?)`,  
      [cedula, usuarioId, telefono]  
    );

    const clienteId = clienteResult.insertId;

    console.log('✅ Cliente registrado exitosamente:', { usuarioId, clienteId, email });
    res.json({
      success: true,
      message: 'Cliente registrado exitosamente. Ahora puedes iniciar sesión.',
      usuario: {
        id_usuario: usuarioId,
        id_cliente: clienteId,
        correo: email,
        id_rol: 3
      }
    });

  } catch (error) {
    console.error('Error en registro cliente:', error);
    
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({
        success: false,
        message: 'Ya existe un usuario con ese correo o cédula'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor: ' + error.message
    });
  }
});
module.exports = router;