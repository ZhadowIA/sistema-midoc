"use client";

import { useState } from "react";

import { IconCheck, IconStar } from "./icons";

interface Review {
  id: string;
  patientName: string;
  rating: number;
  title?: string | null;
  text: string;
  date: string;
  isVerified: boolean;
}

interface Ratings {
  averageRating: number;
  totalReviews: number;
  distribution: {
    five: number;
    four: number;
    three: number;
    two: number;
    one: number;
  };
}

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="dp-stars" role="img" aria-label={`${rating} de 5 estrellas`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <IconStar key={star} className={star <= Math.round(rating) ? "dp-star is-on" : "dp-star"} />
      ))}
    </div>
  );
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function ReviewsSection({ reviews, ratings }: { reviews: Review[]; ratings: Ratings }) {
  const [selectedRating, setSelectedRating] = useState<number | null>(null);

  const filteredReviews = selectedRating
    ? reviews.filter((r) => r.rating === selectedRating)
    : reviews;

  return (
    <section className="dp-section dp-reviews">
      <div className="dp-section-head">
        <p className="dp-kicker">Experiencias</p>
        <h2 className="dp-h2">Opiniones de pacientes</h2>
        <p className="dp-section-sub">
          {ratings.totalReviews} pacientes han valorado su servicio.
        </p>
      </div>

      <div className="dp-reviews-layout">
        {/* Resumen + distribución */}
        <aside className="dp-rating-summary">
          <div className="dp-rating-score">
            <span className="dp-rating-big">{ratings.averageRating}</span>
            <StarRating rating={ratings.averageRating} />
            <span className="dp-rating-total">{ratings.totalReviews} opiniones</span>
          </div>

          <div className="dp-distribution">
            <button
              className={`dp-dist-row dp-dist-all ${selectedRating === null ? "is-active" : ""}`}
              onClick={() => setSelectedRating(null)}
              type="button"
            >
              Todas las opiniones
            </button>

            {[5, 4, 3, 2, 1].map((rating) => {
              const ratingKey = ["one", "two", "three", "four", "five"][rating - 1] as keyof typeof ratings.distribution;
              const count = ratings.distribution[ratingKey];
              const percentage = ratings.totalReviews > 0 ? (count / ratings.totalReviews) * 100 : 0;

              return (
                <button
                  key={rating}
                  className={`dp-dist-row ${selectedRating === rating ? "is-active" : ""}`}
                  onClick={() => setSelectedRating(rating)}
                  type="button"
                >
                  <span className="dp-dist-label">
                    {rating}
                    <IconStar className="dp-dist-star" />
                  </span>
                  <span className="dp-dist-track">
                    <span className="dp-dist-fill" style={{ width: `${percentage}%` }} />
                  </span>
                  <span className="dp-dist-count">{count}</span>
                </button>
              );
            })}
          </div>
        </aside>

        {/* Lista de opiniones */}
        <div className="dp-reviews-list">
          {filteredReviews.length > 0 ? (
            filteredReviews.map((review) => (
              <article className="dp-review" key={review.id}>
                <header className="dp-review-head">
                  <span className="dp-review-avatar" aria-hidden>
                    {initials(review.patientName)}
                  </span>
                  <div className="dp-review-meta">
                    <h4 className="dp-review-author">{review.patientName}</h4>
                    <time className="dp-review-date">
                      {new Intl.DateTimeFormat("es-MX", { dateStyle: "long" }).format(
                        new Date(review.date)
                      )}
                    </time>
                  </div>
                  <StarRating rating={review.rating} />
                </header>

                {review.title && <h5 className="dp-review-title">{review.title}</h5>}
                <p className="dp-review-text">{review.text}</p>

                {review.isVerified && (
                  <span className="dp-review-badge">
                    <IconCheck className="dp-inline-icon" />
                    Cita verificada
                  </span>
                )}
              </article>
            ))
          ) : (
            <div className="dp-reviews-empty">
              <p>No hay opiniones con esa calificación.</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
