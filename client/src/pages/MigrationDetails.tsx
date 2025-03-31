import React from 'react';
import { useParams } from 'react-router-dom';

const MigrationDetails: React.FC = () => {
  const { id } = useParams();

  return (
    <div>
      <h1>Migration Details for ID: {id}</h1>
      {/* Add migration details content */}
    </div>
  );
};

export default MigrationDetails;