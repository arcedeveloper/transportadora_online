/**
 * @fileoverview Middleware de autenticación y autorización con JWT.
 * Verifica si el token JWT es válido y si el usuario tiene el rol necesario.
 * VERSIÓN CORREGIDA PARA MULTIEMPRESA - SIN DEBUG VERBOSO
 */
const jwt = require('jsonwebtoken');
const pool = require('../models/database');

const JWT_SECRET = process.env.JWT_SECRET || 'defaultsecret';

const LOG_ENABLED = false; 

const logAuth = (message) => {
    if (LOG_ENABLED) console.log(`🔐 ${message}`);
};

const logError = (message, error = null) => {
    console.error(`❌ ${message}`);
    if (error) console.error(error);
};

const authMiddleware = async (req, res, next) => {
    const authHeader = req.header('Authorization') || req.headers.authorization;

    if (!authHeader) {
        return res.status(401).json({ 
            success: false,
            message: 'Acceso denegado. No se proporcionó token.' 
        });
    }

    try {
        const cleanToken = authHeader.startsWith('Bearer ') 
            ? authHeader.replace('Bearer ', '') 
            : authHeader;
        
        const decoded = jwt.verify(cleanToken, JWT_SECRET);
        let empresa_id = decoded.empresa_id;
        let userData = { ...decoded };
        if (empresa_id) {
            logAuth(`Empresa ID: ${empresa_id}`);
        } 
        else if (decoded.tipo === 'empresa') {
            const [empresaData] = await pool.query(
                'SELECT empresa_id, nombre_empresa, correo_electronico FROM empresas WHERE empresa_id = ?', 
                [decoded.empresa_id || decoded.id]
            );
            
            if (empresaData.length === 0) {
                return res.status(401).json({ 
                    success: false,
                    message: 'Empresa no encontrada.' 
                });
            }
            
            empresa_id = empresaData[0].empresa_id;
            userData = {
                ...decoded,
                empresa_id: empresaData[0].empresa_id,
                nombre_empresa: empresaData[0].nombre_empresa,
                correo: empresaData[0].correo_electronico,
                tipo: 'empresa'
            };
            
        } 
        else {
            const [userDataDB] = await pool.query(
                'SELECT id_usuario, empresa_id, correo, id_rol FROM usuarios WHERE id_usuario = ?', 
                [decoded.id_usuario]
            );
            
            if (userDataDB.length === 0) {
                return res.status(401).json({ 
                    success: false,
                    message: 'Usuario no encontrado.' 
                });
            }
            
            empresa_id = userDataDB[0].empresa_id;
            
            if (!empresa_id && userDataDB[0].id_rol === 2) {
                const [transportistaData] = await pool.query(
                    'SELECT empresa_id FROM transportistas WHERE id_usuario = ?',
                    [decoded.id_usuario]
                );
                
                if (transportistaData.length > 0) {
                    empresa_id = transportistaData[0].empresa_id;
                }
            }
            
            if (!empresa_id) {
                empresa_id = 1;
            }
            
            userData = {
                ...decoded,
                empresa_id: empresa_id,
                correo: userDataDB[0].correo,
                id_rol: userDataDB[0].id_rol
            };
        }
        if (!userData.empresa_id) {
            userData.empresa_id = 1;
        }

        req.user = userData;
        next();
        
    } catch (err) {
        logError('Token inválido:', err.message);
        res.status(400).json({ 
            success: false,
            message: 'Token no válido: ' + err.message 
        });
    }
};

const checkRole = (role) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ 
                success: false,
                message: 'No autenticado.' 
            });
        }
        const isAdmin = req.user.id_rol === 1;
        
        if (role === 'Administrador' && !isAdmin) {
            return res.status(403).json({ 
                success: false,
                message: 'Acceso denegado. Se requieren permisos de administrador.' 
            });
        }
        
        next();
    };
};

module.exports = { authMiddleware, checkRole };
