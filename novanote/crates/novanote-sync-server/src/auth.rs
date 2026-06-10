use axum::{
    extract::{Request, State},
    http::StatusCode,
    middleware::Next,
    response::{IntoResponse, Response},
};
use jsonwebtoken::{encode, decode, Header, Validation, EncodingKey, DecodingKey};
use serde::{Serialize, Deserialize};
use chrono::{Utc, Duration};
use uuid::Uuid;
use crate::server::AppState;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Claims {
    pub sub: String,      // user_id
    pub exp: usize,       // expiry
    pub iat: usize,       // issued at
}

/// Extractor that carries the authenticated user's ID.
/// Inserted into request extensions by the auth middleware.
#[derive(Debug, Clone)]
pub struct AuthUser {
    pub user_id: Uuid,
}

pub fn create_token(user_id: &str, secret: &str) -> Result<String, jsonwebtoken::errors::Error> {
    let now = Utc::now();
    let claims = Claims {
        sub: user_id.to_string(),
        exp: (now + Duration::hours(24)).timestamp() as usize,
        iat: now.timestamp() as usize,
    };
    encode(&Header::default(), &claims, &EncodingKey::from_secret(secret.as_bytes()))
}

pub fn verify_token(token: &str, secret: &str) -> Result<Claims, jsonwebtoken::errors::Error> {
    decode::<Claims>(token, &DecodingKey::from_secret(secret.as_bytes()), &Validation::default())
        .map(|data| data.claims)
}

/// Axum middleware that validates JWT tokens on incoming requests.
///
/// Extracts the `Authorization: Bearer <token>` header, validates the JWT
/// against the app's secret, and — on success — inserts an `AuthUser` into
/// request extensions so downstream handlers can extract it.
///
/// Returns 401 Unauthorized if the header is missing or the token is invalid.
pub async fn auth_middleware(
    State(state): State<AppState>,
    mut request: Request,
    next: Next,
) -> Response {
    let auth_header = request
        .headers()
        .get(axum::http::header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok());

    let token = match auth_header {
        Some(header) => {
            // Expect "Bearer <token>"
            if let Some(token) = header.strip_prefix("Bearer ") {
                token
            } else {
                return (StatusCode::UNAUTHORIZED, "Missing Bearer prefix").into_response();
            }
        }
        None => {
            return (StatusCode::UNAUTHORIZED, "Missing Authorization header").into_response();
        }
    };

    match verify_token(token, &state.jwt_secret) {
        Ok(claims) => {
            let user_id = match Uuid::parse_str(&claims.sub) {
                Ok(id) => id,
                Err(_) => {
                    return (StatusCode::UNAUTHORIZED, "Invalid user ID in token").into_response();
                }
            };
            request.extensions_mut().insert(AuthUser { user_id });
            next.run(request).await
        }
        Err(_) => (StatusCode::UNAUTHORIZED, "Invalid or expired token").into_response(),
    }
}
