"use client";

import { useState } from "react";

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
    <div className="star-rating">
      {[1, 2, 3, 4, 5].map((star) => (
        <span key={star} className={star <= Math.round(rating) ? "star filled" : "star"}>
          ★
        </span>
      ))}
    </div>
  );
}

export function ReviewsSection({ reviews, ratings }: { reviews: Review[]; ratings: Ratings }) {
  const [selectedRating, setSelectedRating] = useState<number | null>(null);

  const filteredReviews = selectedRating
    ? reviews.filter((r) => r.rating === selectedRating)
    : reviews;

  return (
    <section className="reviews-section">
      <div className="section-header">
        <h2>Opiniones de pacientes</h2>
        <p className="section-subtitle">{ratings.totalReviews} pacientes han valorado su servicio</p>
      </div>

      {/* Rating Distribution */}
      <div className="rating-distribution">
        <div className="distribution-item">
          <button
            className={`distribution-bar ${selectedRating === null ? "active" : ""}`}
            onClick={() => setSelectedRating(null)}
          >
            <div className="distribution-label">
              <span className="label-text">Todas ({ratings.totalReviews})</span>
            </div>
            <div className="distribution-bar-fill" style={{ width: "100%" }}></div>
          </button>
        </div>

        {[5, 4, 3, 2, 1].map((rating) => {
          const count = ratings.distribution[rating as keyof typeof ratings.distribution];
          const percentage = ratings.totalReviews > 0 ? (count / ratings.totalReviews) * 100 : 0;

          return (
            <button
              key={rating}
              className={`distribution-bar ${selectedRating === rating ? "active" : ""}`}
              onClick={() => setSelectedRating(rating)}
            >
              <div className="distribution-label">
                <div className="distribution-stars">
                  {[...Array(rating)].map((_, i) => (
                    <span key={i} className="star filled">
                      ★
                    </span>
                  ))}
                </div>
                <span className="label-text">
                  {count} {count === 1 ? "opinión" : "opiniones"}
                </span>
              </div>
              <div className="distribution-bar-fill" style={{ width: `${percentage}%` }}></div>
            </button>
          );
        })}
      </div>

      {/* Reviews Grid */}
      {filteredReviews.length > 0 ? (
        <div className="reviews-grid">
          {filteredReviews.map((review) => (
            <div className="review-card" key={review.id}>
              {review.isVerified && <div className="review-badge">✓ Compra verificada</div>}

              <div className="review-header">
                <div>
                  <h4 className="review-author">{review.patientName}</h4>
                  <p className="review-date">
                    {new Intl.DateTimeFormat("es-MX", {
                      dateStyle: "long"
                    }).format(new Date(review.date))}
                  </p>
                </div>
                <StarRating rating={review.rating} />
              </div>

              {review.title && <h5 className="review-title">{review.title}</h5>}
              <p className="review-text">{review.text}</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="no-reviews">
          <p>No hay opiniones con esa calificación</p>
        </div>
      )}
    </section>
  );
}
