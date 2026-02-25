export const taskRelationIncludeFull = {
  country: true,
  assignee: {
    select: {
      id: true,
      email: true,
      countryCode: true,
      name: true
    }
  },
  updatedBy: {
    select: {
      id: true,
      email: true,
      name: true
    }
  },
  signedOffBy: {
    select: {
      id: true,
      email: true,
      name: true
    }
  },
  comments: {
    include: {
      author: {
        select: {
          id: true,
          email: true,
          name: true
        }
      }
    },
    orderBy: {
      createdAt: 'asc' as const
    }
  },
  steps: {
    orderBy: {
      order: 'asc' as const
    }
  }
} as const;

export const taskRelationIncludeSafe = {
  country: true,
  assignee: {
    select: {
      id: true,
      email: true,
      countryCode: true,
      name: true
    }
  },
  comments: {
    include: {
      author: {
        select: {
          id: true,
          email: true,
          name: true
        }
      }
    },
    orderBy: {
      createdAt: 'asc' as const
    }
  },
  steps: {
    orderBy: {
      order: 'asc' as const
    }
  }
} as const;
