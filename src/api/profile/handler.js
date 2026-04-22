class ProfileHandler {
  constructor(service) {
    this._service = service; // Gabungan dari UsersService, JobsService, dll.
  }

  async getMyProfileHandler(req, res, next) {
    try {
      const { id } = req.user; // Diambil dari decoded JWT
      const profile = await this._service.getUserById(id);
      res.status(200).json({ status: 'success', data: { profile } });
    } catch (error) { next(error); }
  }

  async getMyBookmarksHandler(req, res, next) {
    try {
      const { id } = req.user;
      const bookmarks = await this._service.getBookmarksByUserId(id);
      res.status(200).json({ status: 'success', data: { bookmarks } });
    } catch (error) { next(error); }
  }
}